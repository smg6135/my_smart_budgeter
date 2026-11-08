export const CURRENCIES = [
  'SGD',
  'USD',
  'CAD',
  'EUR',
  'GBP',
  'AUD',
  'HKD',
  'JPY',
  'KRW',
  'CNY',
  'INR',
  'MYR',
  'THB',
  'IDR',
  'PHP',
  'VND',
  'NZD',
  'CHF',
] as const;
export type Currency = (typeof CURRENCIES)[number];
export type FxSnapshot = {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  expiresAt: string;
  source: string;
};
export type OriginalAmount = {
  amount: number;
  currency: string;
  rate: number;
  fetchedAt: string;
  source: string;
};
export const supportedCurrency = (code: string) => (CURRENCIES as readonly string[]).includes(code);
export const decimals = (currency: string) => (['JPY', 'KRW', 'VND'].includes(currency) ? 0 : 2);
export const units = (currency: string) => 10 ** decimals(currency);
export function parseAmount(value: string, currency = 'SGD') {
  const places = decimals(currency),
    pattern = places === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(value.trim()))
    throw new Error(
      places === 0
        ? `${currency} amounts must be whole numbers.`
        : 'Enter an amount with up to 2 decimal places.',
    );
  const n = Math.round(Number(value) * units(currency));
  if (!Number.isSafeInteger(n) || n > 100000000000) throw new Error('Amount is too large.');
  return n;
}
export function formatMoney(amount: number, currency = 'SGD', code = false) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    currencyDisplay: code ? 'code' : 'symbol',
    minimumFractionDigits: decimals(currency),
    maximumFractionDigits: decimals(currency),
  }).format(amount / units(currency));
}
export function convertMinor(amount: number, from: string, to: string, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('A positive exchange rate is required.');
  const converted = Math.round((amount / units(from)) * rate * units(to));
  if (!Number.isSafeInteger(converted)) throw new Error('Converted amount is too large.');
  return converted;
}
export function rateFor(quote: FxSnapshot | undefined, base: string, currency: string) {
  if (base === currency) return 1;
  if (quote?.base !== base) return undefined;
  const rate = quote.rates[currency];
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}
export const freshQuote = (quote: FxSnapshot | undefined) =>
  !!quote && Date.parse(quote.expiresAt) > Date.now();
export function displayAmount(amount: number, base: string, display: string, quote?: FxSnapshot) {
  const rate = rateFor(quote, base, display);
  // Never relabel an amount when conversion is unavailable.
  return rate === undefined
    ? formatMoney(amount, base, true)
    : formatMoney(convertMinor(amount, base, display, rate), display);
}
