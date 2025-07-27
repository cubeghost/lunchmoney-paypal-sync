import "dotenv/config";

import { parseArgs, styleText } from "node:util";
import {
  addDays,
  closestIndexTo,
  differenceInDays,
  formatISO,
  getMonth,
  getYear,
  lastDayOfMonth,
  subDays,
} from "date-fns";
import Table from "cli-table3";
import { confirm } from "@inquirer/prompts";

import { getPaypalTransactions, NVPTransaction } from "./paypal.mjs";
import {
  getLunchMoneyTransactions,
  Transaction,
  updateLunchMoneyTransaction,
} from "./lunchmoney.mjs";

const { values } = parseArgs({
  options: {
    month: {
      type: "string",
    },
    year: {
      type: "string",
    },
  },
});
const today = new Date();
const month = values.month ? parseInt(values.month) - 1 : getMonth(today);
const year = values.year ? parseInt(values.year) : getYear(today);

const startDate = new Date(year, month, 1);
const endDate = lastDayOfMonth(startDate);

const lunchMoneyTransactions = await getLunchMoneyTransactions(
  startDate,
  endDate,
);
const paypalTransactions = await getPaypalTransactions(
  subDays(startDate, 7),
  addDays(endDate, 7)
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

const paypalAmounts = new Map<number, NVPTransaction[]>();
for (const pp of paypalTransactions) {
  const amount = parseFloat(pp.L_AMT);
  if (paypalAmounts.has(amount)) {
    paypalAmounts.set(amount, [...paypalAmounts.get(amount)!, pp]);
  } else {
    paypalAmounts.set(amount, [pp]);
  }
}

console.log(
  "oldest paypal transaction",
  paypalTransactions.at(-1)?.L_TIMESTAMP,
);

const updates = new Map<
  Transaction["id"],
  { id: number; payee: string; matchDate: Date }
>();

for (const transaction of transactions) {
  const date = new Date(transaction.date);
  const amount = parseFloat(transaction.amount);
  const paypalAmountMatches = paypalAmounts.get(amount);

  if (!paypalAmountMatches || paypalAmountMatches.length === 0) {
    console.warn("No matches found for transaction", transaction);
    continue;
  }
  // if (paypalAmountMatches.length > 1) {
  //   console.log({id: transaction.id, date: transaction.date, amount: amount}, paypalAmountMatches)
  // }

  const matchDates = paypalAmountMatches.map((pp) => pp.L_TIMESTAMP);
  const closestIndex = closestIndexTo(date, matchDates);
  if (closestIndex === undefined) {
    continue;
  }

  const closestMatch = paypalAmountMatches.at(closestIndex)!;
  if (differenceInDays(date, closestMatch.L_TIMESTAMP) > 3) {
    console.warn(
      `Amount match found, but too far away`,
      transaction,
      closestMatch,
    );
    continue;
  }

  // Remove match from availble options
  paypalAmounts.set(
    amount,
    paypalAmountMatches.filter(
      (pp) => pp.L_TRANSACTIONID !== closestMatch.L_TRANSACTIONID,
    ),
  );

  updates.set(transaction.id, {
    id: transaction.id,
    payee: closestMatch.L_NAME,
    matchDate: closestMatch.L_TIMESTAMP,
  });
}

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
console.log(table.toString());

const answer = await confirm({ message: "Update transactions?" });

if (!answer) {
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
