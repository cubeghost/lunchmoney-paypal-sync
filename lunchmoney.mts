import { formatISO, subYears } from "date-fns";

const API_BASE = "https://dev.lunchmoney.app";
const ACCESS_TOKEN = process.env.LUNCHMONEY_ACCESS_TOKEN;

export declare enum TransactionStatus {
  CLEARED = "cleared",
  UNCLEARED = "uncleared",
  PENDING = "pending"
}
export interface Transaction {
  id: number;
  date: string;
  payee: string;
  amount: string;
  to_base: number;
  currency: string;
  notes: string;
  original_name: string | null;
  category_id: number | null;
  category_name: string | null;
  asset_id: number | null;
  plaid_account_id: number | null;
  status: TransactionStatus;
  is_pending: boolean;
  parent_id: number | null;
  is_group: boolean;
  group_id: number | null;
  tags: Tag[];
  external_id: string | null;
  plaid_metadata: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateTransaction extends 
  Pick<Transaction, "id">, 
  Partial<Pick<Transaction, "payee" | "notes" | "status" | "category_id">> 
{
  tags: string[] | number[] | null;
}

export interface Tag {
  id: number;
  name: string;
}

export async function getLunchMoneyTransactions(startDate: Date, endDate: Date) {
  const options = new URLSearchParams({
    debit_as_negative: "true",
    status: "uncleared",
    start_date: formatISO(startDate, { representation: "date" }),
    end_date: formatISO(endDate, { representation: "date" }),
  });
  const response = await fetch(`${API_BASE}/v1/transactions?${options.toString()}`, {
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  const data = JSON.parse(text, jsonDateReviver);

  if (!data.transactions) {
    console.log(data);
  }

  return data.transactions as Transaction[];
}

export async function updateLunchMoneyTransaction(transaction: UpdateTransaction) {
  const response = await fetch(`${API_BASE}/v1/transactions/${transaction.id}`, {
    method: "PUT",
    body: JSON.stringify({
      debit_as_negative: true,
      transaction
    }),
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data as {updated: boolean};
}

function jsonDateReviver(_key: string, value: JSONSerializable) {
  const dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,}|)Z$/;
  if (typeof value === "string" && dateFormat.test(value)) {
    return new Date(value);
  }
  return value;
}

type JSONPrimitive = string | number | boolean | null;

type JSONSerializable =
  | JSONPrimitive
  | JSONSerializable[]
  | { [k: string]: JSONSerializable | undefined };
