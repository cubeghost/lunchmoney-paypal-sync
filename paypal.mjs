import nvp from 'nvp-json'; 

const NVP_ENDPOINT = "https://api-3t.paypal.com/nvp";

const NVP_CREDENTIALS = {
  USER: process.env.NVP_USERNAME,
  PWD: process.env.NVP_PASSWORD,
  SIGNATURE: process.env.NVP_SIGNATURE,
  VERSION: '200'
}

const ONE_YEAR_AGO_MS = 60 * 60 * 24 * 365 * 1000;

const TRANSACTION_FIELDS = ["L_TIMESTAMP", "L_TIMEZONE", "L_TYPE", "L_EMAIL", "L_NAME", "L_TRANSACTIONID", "L_STATUS", "L_AMT", "L_CURRENCYCODE", "L_FEEAMT", "L_NETAMT"];
const DATETIME_FIELDS = ["L_TIMESTAMP"];
const TRANSACTION_FIELD_REGEX = new RegExp(`^(${TRANSACTION_FIELDS.join("|")})(\\d+)$`);
function parseResponse(text) {
  const entries = new URLSearchParams(text).entries();
  const data = {
    RESULTS: []
  };
  
  for (const [key, rawValue] of entries) {
    const matches = key.match(TRANSACTION_FIELD_REGEX);
    const value = DATETIME_FIELDS.includes(key) ? new Date(rawValue) : rawValue;
    if (matches) {
      const [_, field, index] = matches;
      data.RESULTS[index] = data.RESULTS[index] || {};
      data.RESULTS[index][field] = value;
    } else {
      data[key] = value;
    }
  }

  return data;
}

export async function getPaypalTransactions() {
  const nvpString = nvp.toNVP({
    ...NVP_CREDENTIALS,
    METHOD: "TransactionSearch",
    STARTDATE: new Date(Date.now() - ONE_YEAR_AGO_MS).toISOString()
  });

  const response = await fetch(`${NVP_ENDPOINT}?${nvpString}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  const data = parseResponse(text);

  return data.RESULTS;
}