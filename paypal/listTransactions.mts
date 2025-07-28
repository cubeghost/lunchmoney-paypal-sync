import {
  ERROR_LIST_FIELDS,
  fetchNVP,
  isDatetimeField,
  isNVPResponseField,
  isParsedErrorField,
  makeListFieldMatcher,
  parseValue,
  type NVPResponseField,
  type MapDateTimeFields,
  type NVPError,
  type NVPErrorField,
  type NVPListErrorField,
  type OneOrTwoDigitString,
  type NVPAPIResponse,
} from "./nvp.mjs";

export async function getPaypalTransactions(startDate: Date, endDate: Date) {
  const text = await fetchNVP({
    METHOD: "TransactionSearch",
    TRANSACTIONCLASS: "Sent",
    STARTDATE: startDate.toISOString(),
    ENDDATE: endDate.toISOString(),
  });
  const data = parseTransactionsResponse(text);

  const { TRANSACTIONS, ...rest } = data;
  console.log(rest);

  return TRANSACTIONS.filter(
    (transaction) => transaction.L_TYPE !== "Authorization",
  );
}

function parseTransactionsResponse(text: string): NVPTransactionsResponse {
  const source = Object.fromEntries([
    ...new URLSearchParams(text).entries(),
  ]) as SourceNVP;

  const response = {} as Record<string, string | Date>;
  const data: Pick<NVPTransactionsResponse, "TRANSACTIONS" | "ERRORS"> = {
    TRANSACTIONS: [],
    ERRORS: [],
  };

  for (const key in source) {
    if (!isSourceField(key))
      throw new Error(`Unrecognized response field: ${key}`);

    if (isNVPResponseField(key)) {
      response[key] = parseValue(key, source[key]);
      continue;
    }

    const listField = matchListField(key);
    if (!listField) continue;
    const { field, index } = listField;

    if (isParsedTransactionField(field)) {
      data.TRANSACTIONS[index] =
        data.TRANSACTIONS[index] || ({} as NVPTransaction);

      if (isDatetimeField(field)) {
        data.TRANSACTIONS[index][field] = new Date(source[key]);
      } else {
        data.TRANSACTIONS[index][field] = source[key];
      }
    } else if (isParsedErrorField(field)) {
      data.ERRORS[index] = data.ERRORS[index] || ({} as NVPError);
      data.ERRORS[index][field] = source[key];
    }
  }

  return {
    ...response,
    ...data,
  } as NVPTransactionsResponse;
}

const TRANSACTION_LIST_FIELDS = ["L_TIMESTAMP", "L_TIMEZONE", "L_TYPE", "L_EMAIL", "L_NAME", "L_TRANSACTIONID", "L_STATUS", "L_AMT", "L_CURRENCYCODE", "L_FEEAMT", "L_NETAMT"] as const; // prettier-ignore

type NVPTransactionField = (typeof TRANSACTION_LIST_FIELDS)[number];
type NVPListTransactionField = `${NVPTransactionField}${OneOrTwoDigitString}`;

const { listFieldRegex, matchListField } = makeListFieldMatcher<
  NVPTransactionField | NVPErrorField
>([...TRANSACTION_LIST_FIELDS, ...ERROR_LIST_FIELDS]);

function isParsedTransactionField(key: string): key is NVPTransactionField {
  return (TRANSACTION_LIST_FIELDS as ReadonlyArray<string>).includes(key);
}

export type NVPTransaction = {
  [K in (typeof TRANSACTION_LIST_FIELDS)[number]]: MapDateTimeFields<K>;
};

type NVPTransactionsResponse = NVPAPIResponse & {
  TRANSACTIONS: NVPTransaction[];
  ERRORS: NVPError[];
};

type SourceNVP =
  | { [K in NVPResponseField]: string }
  | { [K in NVPListTransactionField]?: string }
  | { [K in NVPListErrorField]?: string };

function isSourceField(key: string): key is keyof SourceNVP {
  return isNVPResponseField(key) || listFieldRegex.test(key);
}
