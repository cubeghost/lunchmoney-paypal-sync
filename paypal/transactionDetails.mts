import {
  ERROR_LIST_FIELDS,
  fetchNVP,
  isDatetimeField,
  isNVPResponseField,
  isParsedErrorField,
  makeListFieldMatcher,
  parseValue,
  type MapDateTimeFields,
  type NVPError,
  type NVPErrorField,
} from "./nvp.mjs";

export async function getPaypalTransactionDetails(transactionId: string) {
  const text = await fetchNVP({
    METHOD: "GetTransactionDetails",
    TRANSACTIONID: transactionId,
  });
  const data = parseTransactionDetailsResponse(text);

  return data;
}

function parseTransactionDetailsResponse(
  text: string,
): NVPTransactionDetailsResponse {
  const source = Object.fromEntries([
    ...new URLSearchParams(text).entries(),
  ]) as Record<string, string>;

  const response = {} as Record<string, string | Date>;
  const errors: NVPTransactionDetailsResponse["ERRORS"] = [];

  for (const key in source) {
    // if (!isSourceField(key))
    //   throw new Error(`Unrecognized response field: ${key}`);

    if (isNVPResponseField(key)) {
      response[key] = parseValue(key, source[key]);
      continue;
    }

    const listField = matchListField(key);
    if (listField) {
      const { field, index } = listField;

      if (isParsedErrorField(field)) {
        errors[index] = errors[index] || ({} as NVPError);
        errors[index][field] = source[key];
        continue;
      }
    }

    // this one has soooo many possible fields, just do whatever for now
    response[key] = parseValue(key, source[key]);
  }

  return {
    ...response,
    ERRORS: errors,
  } as NVPTransactionDetailsResponse;
}

const { matchListField } = makeListFieldMatcher<NVPErrorField>([
  ...ERROR_LIST_FIELDS,
]);

const DETAILS_FIELDS = ["TRANSACTIONID", "TRANSACTIONTYPE", "PAYMENTTYPE", "ORDERTIME", "AMT", "CURRENCYCODE", "FEEAMT", "SETTLEAMT", "TAXAMT", "EXCHANGERATE", "PAYMENTSTATUS", "SUBJECT"] as const; // prettier-ignore
type NVPTransactionDetailsField = (typeof DETAILS_FIELDS)[number];

type NVPTransactionDetailsResponse = {
  [K in NVPTransactionDetailsField]: MapDateTimeFields<K>;
} & {
  ERRORS: NVPError[];
};
