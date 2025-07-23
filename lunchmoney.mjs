const API_BASE = "https://dev.lunchmoney.app";
const ACCESS_TOKEN = process.env.LUNCHMONEY_ACCESS_TOKEN;

export async function getLunchMoneyTransactions() {
  const options = new URLSearchParams({
    status: "uncleared",
    // TODO date stuff
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

  return data.transactions;
}

function jsonDateReviver(_key, value) {
  const dateFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,}|)Z$/;
  if (typeof value === "string" && dateFormat.test(value)) {
    return new Date(value);
  }
  return value;
}
