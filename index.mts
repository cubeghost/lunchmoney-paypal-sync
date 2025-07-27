import 'dotenv/config';

import { getPaypalTransactions, NVPTransaction } from "./paypal.mjs";
import { getLunchMoneyTransactions } from "./lunchmoney.mjs";

const paypalTransactions = await getPaypalTransactions();
const lunchMoneyTransactions = await getLunchMoneyTransactions();

const transactions = lunchMoneyTransactions
  .filter((transaction) => (
    transaction.original_name?.includes("PAYPAL TYPE: INST XFER") && 
    transaction.tags.findIndex(tag => tag.name === "paypal") === -1
  ))
  .sort((a, b) => b.created_at.valueOf() - a.created_at.valueOf());

const availablePaypalTransactions = new Map<string, NVPTransaction>();
const paypalAmounts = new Map<number, NVPTransaction[]>();
for (const pp of paypalTransactions) {
  availablePaypalTransactions.set(pp.L_TRANSACTIONID, pp);

  const amount = parseFloat(pp.L_AMT);
  if (paypalAmounts.has(amount)) {
    paypalAmounts.set(amount, [...paypalAmounts.get(amount)!, pp])
  } else {
    paypalAmounts.set(amount, [pp]);
  }
}

for (const transaction of transactions) {
  const amount = parseFloat(transaction.amount);
  const paypalAmountMatches = paypalAmounts.get(amount);
  // console.log("transaction", {date: transaction.date, parsedAmount: amount, amount: transaction.amount, to_base: transaction.to_base});
  // console.log("matches",paypalAmountMatches)
}

// [ { name: 'paypal', id: 148158 } ]