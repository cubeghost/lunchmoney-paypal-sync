import nvp from "nvp-json";
import { env } from "../util.mjs";

export const NVP_ENDPOINT = "https://api-3t.paypal.com/nvp";

export const NVP_CREDENTIALS = {
  USER: env("NVP_USERNAME"),
  PWD: env("NVP_PASSWORD"),
  SIGNATURE: env("NVP_SIGNATURE"),
  VERSION: "200",
};

export async function fetchNVP(parameters: Record<string, string>) {
  const nvpString = nvp.toNVP({
    ...NVP_CREDENTIALS,
    ...parameters,
  });

  const response = await fetch(`${NVP_ENDPOINT}?${nvpString}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.text();
}

export type NVPAPIResponse = {
  [K in NVPResponseField]: MapDateTimeFields<K>;
};

// General API response fields
const NVP_RESPONSE_FIELDS = ["TIMESTAMP", "CORRELATIONID", "ACK", "VERSION", "BUILD"] as const; // prettier-ignore

export type NVPResponseField = (typeof NVP_RESPONSE_FIELDS)[number];

export function isNVPResponseField(key: string): key is NVPResponseField {
  return (NVP_RESPONSE_FIELDS as ReadonlyArray<string>).includes(key);
}

export function parseValue(key: string, value: string) {
  return isDatetimeField(key) ? new Date(value) : (value as string);
}

// Errors
export const ERROR_LIST_FIELDS = ["L_ERRORCODE", "L_SHORTMESSAGE", "L_LONGMESSAGE", "L_SEVERITYCODE"] as const; // prettier-ignore

export type NVPErrorField = (typeof ERROR_LIST_FIELDS)[number];
export type NVPListErrorField = `${NVPErrorField}${OneOrTwoDigitString}`;
export type NVPError = {
  [K in (typeof ERROR_LIST_FIELDS)[number]]: MapDateTimeFields<K>;
};

export function isParsedErrorField(key: string): key is NVPErrorField {
  return (ERROR_LIST_FIELDS as ReadonlyArray<string>).includes(key);
}

// Datetime fields
const DATETIME_FIELDS = ["TIMESTAMP", "L_TIMESTAMP", "ORDERTIME"] as const; // prettier-ignore

export type NVPDateTimeField = (typeof DATETIME_FIELDS)[number];

export function isDatetimeField(key: string): key is NVPDateTimeField {
  return (DATETIME_FIELDS as ReadonlyArray<string>).includes(key);
}

export type MapDateTimeFields<FieldType> = FieldType extends NVPDateTimeField
  ? Date
  : string;

// List fields
type PositiveDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Digit = "0" | PositiveDigit;
export type OneOrTwoDigitString = Digit | `${PositiveDigit}${Digit}`;

export function makeListFieldMatcher<T>(fields: T[]) {
  const listFieldRegex = new RegExp(`^(${fields.join("|")})(\\d+)$`);

  function matchListField(key: string) {
    const matches = key.match(listFieldRegex);
    if (!matches) return;

    const [_, field, indexStr] = matches;
    const index = parseInt(indexStr);

    return {
      field: field as T,
      index,
    };
  }

  return {
    listFieldRegex,
    matchListField,
  };
}
