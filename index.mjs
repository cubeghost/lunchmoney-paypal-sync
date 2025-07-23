import 'dotenv/config';

import { getPaypalTransactions } from "./paypal.mjs";
import { getLunchMoneyTransactions } from "./lunchmoney.mjs";

const paypalTransactions = await getPaypalTransactions();
const lunchMoneyTransactions = await getLunchMoneyTransactions();

const transactions = lunchMoneyTransactions
  .filter((transaction) => transaction.original_name.includes("PAYPAL TYPE: INST XFER"))
  .sort((a, b) => b.created_at - a.created_at);

console.log(transactions[0])
console.log(paypalTransactions[0])
