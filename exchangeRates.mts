import { formatISO } from "date-fns";
import { FlatCache } from "flat-cache";
import { env } from "./util.mjs";

export const exchangeRateCache = new FlatCache({
  ttl: 0,
  lruSize: 10000,
});

const cacheKey = (dateStr: string, currencyCode: string) =>
  `${dateStr}:${currencyCode}`;

interface OpenExchangeRatesResponse {
  base: string;
  rates: Record<string, number>;
}

async function fetchHistoricalExchangeRates(dateStr: string) {
  const params = new URLSearchParams({
    app_id: env("OPEN_EXCHANGE_RATES_APP_ID"),
  });
  const response = await fetch(
    `https://openexchangerates.org/api/historical/${dateStr}.json?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as OpenExchangeRatesResponse;

  return data.rates;
}

export async function getHistoricalExchangeRate(
  date: Date,
  currencyCode: string,
) {
  const dateStr = formatISO(date, { representation: "date" });
  const cachedRate = exchangeRateCache.get<number | undefined>(
    cacheKey(dateStr, currencyCode),
  );

  if (cachedRate) {
    return cachedRate;
  } else {
    const rates = await fetchHistoricalExchangeRates(dateStr);
    const rate = rates[currencyCode];
    if (!rate) {
      console.log(rates);
      throw new Error(
        `Couldn't find currency code "${currencyCode}" in historical exchange rates`,
      );
    }
    exchangeRateCache.set(cacheKey(dateStr, currencyCode), rate);

    return rate;
  }
}

export function getCachedHistoricalExchangeRate(
  date: Date,
  currencyCode: string,
) {
  const dateStr = formatISO(date, { representation: "date" });
  const rate = exchangeRateCache.get<number | undefined>(
    cacheKey(dateStr, currencyCode),
  );
  if (rate === undefined) {
    throw new Error(`Missing exange rate for ${currencyCode} on ${dateStr}`);
  }
  return rate;
}
