import nvp from "nvp-json"; 
import { subYears } from "date-fns";

const NVP_ENDPOINT = "https://api-3t.paypal.com/nvp";

const NVP_CREDENTIALS = {
  USER: process.env.NVP_USERNAME!,
  PWD: process.env.NVP_PASSWORD!,
  SIGNATURE: process.env.NVP_SIGNATURE!,
  VERSION: '200'
}

const RESPONSE_FIELDS = ["TIMESTAMP", "CORRELATIONID", "ACK", "VERSION", "BUILD"] as const;
const TRANSACTION_FIELDS = ["L_TIMESTAMP", "L_TIMEZONE", "L_TYPE", "L_EMAIL", "L_NAME", "L_TRANSACTIONID", "L_STATUS", "L_AMT", "L_CURRENCYCODE", "L_FEEAMT", "L_NETAMT"] as const;
const ERROR_FIELDS = ["L_ERRORCODE", "L_SHORTMESSAGE", "L_LONGMESSAGE", "L_SEVERITYCODE"] as const;

type PositiveDigit = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Digit = '0' | PositiveDigit;
type OneOrTwoDigitString = Digit | `${PositiveDigit}${Digit}`; 
type NVPResponseField = typeof RESPONSE_FIELDS[number];
type NVPSourceTransactionField = `${typeof TRANSACTION_FIELDS[number]}${OneOrTwoDigitString}`;
type NVPTransactionField = typeof TRANSACTION_FIELDS[number];
type NVPSourceErrorField = `${typeof ERROR_FIELDS[number]}${OneOrTwoDigitString}`;
type NVPErrorField = typeof ERROR_FIELDS[number];
type NVPDateTimeField = "TIMESTAMP" | "L_TIMESTAMP";
function isDatetimeField(key: string): key is NVPDateTimeField {
  return key === "TIMESTAMP" || key === "L_TIMESTAMP";
}
function isResponseField(key: string): key is NVPResponseField {
  return (RESPONSE_FIELDS as ReadonlyArray<string>).includes(key)
}
const LIST_FIELD_REGEX = new RegExp(`^(${[...TRANSACTION_FIELDS, ...ERROR_FIELDS].join("|")})(\\d+)$`);
function matchListField(key: string) {
  const matches = key.match(LIST_FIELD_REGEX);
  if (!matches) return;

  const [_, field, indexStr] = matches;
  const index = parseInt(indexStr);

  return {
    field: field as (typeof TRANSACTION_FIELDS[number] | typeof ERROR_FIELDS[number]), 
    index
  };
}
function isParsedTransactionField(key: string): key is NVPTransactionField {
  return (TRANSACTION_FIELDS as ReadonlyArray<string>).includes(key);
}
function isParsedErrorField(key: string): key is NVPErrorField {
  return (ERROR_FIELDS as ReadonlyArray<string>).includes(key);
}

type MapDateTimeFields<FieldType> =
  FieldType extends NVPDateTimeField ? Date : string;

export type NVPTransaction = { [K in typeof TRANSACTION_FIELDS[number]]: MapDateTimeFields<K> };
type NVPError = { [K in typeof ERROR_FIELDS[number]]: MapDateTimeFields<K> }

type NVPTransactionsResponse = { [K in typeof RESPONSE_FIELDS[number]]: MapDateTimeFields<K>; } & {
  TRANSACTIONS: NVPTransaction[];
  ERRORS: NVPError[];
};

type SourceNVP = { [K in NVPResponseField]: string; } 
  | { [K in NVPSourceTransactionField]?: string }
  | { [K in NVPSourceErrorField]?: string };

function isSourceField(key: string): key is keyof SourceNVP {
  return isResponseField(key) || LIST_FIELD_REGEX.test(key);
}

function parseValue(key: string, value: string) {
  return isDatetimeField(key) ? new Date(value) : value as string;
}

function parseResponse(text: string): NVPTransactionsResponse {
  const source = Object.fromEntries([...new URLSearchParams(text).entries()]) as SourceNVP;

  const response = {} as Record<string, string | Date>;
  const data:  Pick<NVPTransactionsResponse, "TRANSACTIONS" | "ERRORS"> = {
    TRANSACTIONS: [],
    ERRORS: []
  }
  
  for (const key in source) {
    if (!isSourceField(key)) throw new Error(`Unrecognized response field: ${key}`);

    if (isResponseField(key)) {
      response[key] = parseValue(key, source[key]);
      continue;
    }

    const listField = matchListField(key);
    if (!listField) continue;
    const { field, index } = listField;

    if (isParsedTransactionField(field)) {      
      data.TRANSACTIONS[index] = data.TRANSACTIONS[index] || {} as NVPTransaction;

      if (isDatetimeField(field)) {
        data.TRANSACTIONS[index][field] = new Date(source[key]);
      } else {
        data.TRANSACTIONS[index][field] = source[key];
      }
    } else if (isParsedErrorField(field)) {
      data.ERRORS[index] = data.ERRORS[index] || {} as NVPError;
      data.ERRORS[index][field] = source[key];
    }
  }

  return data as NVPTransactionsResponse;
}

export async function getPaypalTransactions(startDate: Date, endDate: Date) {
  const nvpString = nvp.toNVP({
    ...NVP_CREDENTIALS,
    METHOD: "TransactionSearch",
    TRANSACTIONCLASS: "Sent",
    STARTDATE: startDate.toISOString(),
    ENDDATE: endDate.toISOString(),
  });

  const response = await fetch(`${NVP_ENDPOINT}?${nvpString}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  const data = parseResponse(text);

  const { TRANSACTIONS, ...rest} = data;
  console.log(rest)

  return TRANSACTIONS.filter(transaction => transaction.L_TYPE !== "Authorization");
}
