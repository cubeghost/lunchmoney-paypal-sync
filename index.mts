import "dotenv/config";

import { parseArgs, styleText } from "node:util";
import {
  addDays,
  closestIndexTo,
  differenceInDays,
  format,
  formatISO,
  getMonth,
  getYear,
  interval,
  isWithinInterval,
  lastDayOfMonth,
  subDays,
} from "date-fns";
import Table from "cli-table3";
import { confirm } from "@inquirer/prompts";

import {
  getPaypalTransactions,
  type NVPTransaction,
} from "./paypal/listTransactions.mjs";
import {
  getLunchMoneyTransactions,
  updateLunchMoneyTransaction,
  type Transaction,
} from "./lunchmoney.mjs";
import { getDateRange } from "./dates.mjs";
import {
  exchangeRateCache,
  getCachedHistoricalExchangeRate,
  getHistoricalExchangeRate,
} from "./exchangeRates.mjs";

const DAY_BUFFER = 4;

const { startDate, endDate } = getDateRange();

console.log(
  "Matching transactions for " +
    styleText("bold", format(startDate, "LLL yyyy")),
);

const lunchMoneyTransactions = await getLunchMoneyTransactions(
  startDate,
  endDate,
);
const paypalTransactions = await getPaypalTransactions(
  subDays(startDate, DAY_BUFFER),
  addDays(endDate, DAY_BUFFER),
);

const transactions = lunchMoneyTransactions
  .filter(
    (transaction) =>
      transaction.original_name?.includes("PAYPAL TYPE: INST XFER") &&
      transaction.tags.findIndex((tag) => tag.name === "paypal") === -1,
  )
  .sort((a, b) => b.created_at.valueOf() - a.created_at.valueOf());

if (transactions.length === 0) {
  console.log("⚠️ No PayPal transactions found in LunchMoney");
  process.exit(0);
}

exchangeRateCache.load();
const intlPaypalTransactions = paypalTransactions.filter(
  (pp) => pp.L_CURRENCYCODE !== "USD",
);
for (const pp of intlPaypalTransactions) {
  await getHistoricalExchangeRate(pp.L_TIMESTAMP, pp.L_CURRENCYCODE);
}
exchangeRateCache.save();

const paypalMatches = new Set<NVPTransaction["L_TRANSACTIONID"]>();
const paypalAmounts = new Map<number, NVPTransaction[]>();
const paypalDates = new Map<string, NVPTransaction[]>();
for (const pp of paypalTransactions) {
  const amount = parseFloat(pp.L_AMT);
  if (paypalAmounts.has(amount)) {
    paypalAmounts.set(amount, [...paypalAmounts.get(amount)!, pp]);
  } else {
    paypalAmounts.set(amount, [pp]);
  }

  const date = formatISO(pp.L_TIMESTAMP, { representation: "date" });
  if (paypalDates.has(date)) {
    paypalDates.set(date, [...paypalDates.get(date)!, pp]);
  } else {
    paypalDates.set(date, [pp]);
  }
}

const updates = new Map<
  Transaction["id"],
  { id: number; payee: string; matchDate: Date }
>();
const maybeMatches = new Map<
  Transaction["id"],
  { amount: number; paypalTransaction: NVPTransaction }
>();

for (const transaction of transactions) {
  const date = new Date(transaction.date);
  const amount = parseFloat(transaction.amount);

  const match = (() => {
    const paypalAmountMatches = paypalAmounts
      .get(amount)
      ?.filter((pp) => !paypalMatches.has(pp.L_TRANSACTIONID));

    if (paypalAmountMatches && paypalAmountMatches.length > 0) {
      const matchDates = paypalAmountMatches.map((pp) => pp.L_TIMESTAMP);
      const closestIndex = closestIndexTo(date, matchDates);

      if (closestIndex !== undefined) {
        const closestAmountMatch = paypalAmountMatches.at(closestIndex)!;
        if (differenceInDays(date, closestAmountMatch.L_TIMESTAMP) <= 3) {
          return closestAmountMatch;
        }
      }
    }

    const dateRange = interval(
      subDays(date, DAY_BUFFER),
      addDays(date, DAY_BUFFER),
    );
    const paypalDateRangeMatches = [...paypalDates.keys()]
      .filter((dateStr) => isWithinInterval(new Date(dateStr), dateRange))
      .flatMap((dateStr) =>
        paypalDates
          .get(dateStr)!
          .filter((pp) => !paypalMatches.has(pp.L_TRANSACTIONID)),
      );

    if (paypalDateRangeMatches && paypalDateRangeMatches.length > 0) {
      const intlMatches = paypalDateRangeMatches
        .filter((pp) => pp.L_CURRENCYCODE !== "USD")
        .map((pp) => {
          const exchangeRate = getCachedHistoricalExchangeRate(
            pp.L_TIMESTAMP,
            pp.L_CURRENCYCODE,
          );
          return {
            amount: parseFloat(pp.L_AMT) / exchangeRate,
            paypalTransaction: pp,
          };
        });

      if (intlMatches.length > 0) {
        const closest = intlMatches.reduce((acc, obj) =>
          Math.abs(amount - obj.amount) < Math.abs(amount - acc.amount)
            ? obj
            : acc,
        );
        const diff = Math.abs(amount - closest.amount);
        if (diff < 0.3) {
          return closest.paypalTransaction;
        } else if (diff <= 1) {
          maybeMatches.set(transaction.id, closest);
        }
      }
    }

    console.warn("No matches found for transaction", transaction);
    return;
  })();

  if (match) {
    // Remove match from availble options
    paypalMatches.add(match.L_TRANSACTIONID);

    updates.set(transaction.id, {
      id: transaction.id,
      payee: match.L_NAME,
      matchDate: match.L_TIMESTAMP,
    });
  }
}

function updatesTable() {
  const table = new Table({
    head: ["id", "date", "amount", "update", "payee", "matchDate"],
  });
  for (const transaction of transactions) {
    const update = updates.get(transaction.id);
    const row = {
      id: transaction.id,
      date: transaction.date,
      amount: parseFloat(transaction.amount),
      update: update ? "✅" : "❌",
      payee: update?.payee ?? "",
      matchDate: update
        ? formatISO(update.matchDate, { representation: "date" })
        : null,
    };

    table.push(Object.values(row));
  }
  return table.toString();
}

console.log(updatesTable());

async function handleUnmatched() {
  if (transactions.every((transaction) => !updates.has(transaction.id))) return;

  if (maybeMatches.size > 0) {
    const viewMaybes = await confirm({ message: "View potential matches?" });
    if (!viewMaybes) return;

    for (const transactionId of maybeMatches.keys()) {
      const transaction = transactions.find((t) => t.id === transactionId)!;
      const { amount: matchAmount, paypalTransaction } =
        maybeMatches.get(transactionId)!;
      const amount = parseFloat(transaction.amount);
      const table = new Table();
      table.push({
        "Transaction date": transaction.date,
        "Transaction amount": amount,
        "Match date": formatISO(paypalTransaction.L_TIMESTAMP, {
          representation: "date",
        }),
        "Match amount": `${matchAmount} (${paypalTransaction.L_AMT} ${paypalTransaction.L_CURRENCYCODE})`,
        "Match name": paypalTransaction.L_NAME,
      });
      // TODO confirm, push to updates
    }

    // console.log(updatesTable());
  } else {
    console.log("No potential matches found");
    const viewUnmatched = await confirm({
      message: "View all unmatched Paypal transactions?",
    });
    if (!viewUnmatched) return;

    console.log(
      paypalTransactions.filter((pp) => !paypalMatches.has(pp.L_TRANSACTIONID)),
    );
  }
}
await handleUnmatched();

const shouldUpdate = await confirm({ message: "Update transactions?" });
if (!shouldUpdate) {
  process.exit(0);
}

const updatesArray = [...updates.values()];
const results = await Promise.allSettled(
  updatesArray.map(async (update) =>
    updateLunchMoneyTransaction({
      id: update.id,
      payee: update.payee,
      tags: ["paypal"],
    }),
  ),
);

results.forEach((result, index) => {
  if (result.status === "rejected") {
    const update = updatesArray[index];
    console.log(`⚠️ Failed to update transaction ${update.id}:`, result.reason);
  }
});

const successCount = results.reduce(
  (acc, value) => (value.status === "fulfilled" ? acc + 1 : acc),
  0,
);
console.log(styleText("green", `Updated ${successCount} transactions`));
