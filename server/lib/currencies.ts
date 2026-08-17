export const SUPPORTED_CURRENCIES = [
  "USD",
  "MYR",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "AUD",
] as const;

// Sane starting points only -- admins should verify/update these in
// Settings. 1 unit of the currency = this many SGD.
export const DEFAULT_RATES_TO_SGD: Record<string, number> = {
  USD: 1.34,
  MYR: 0.3,
  EUR: 1.45,
  GBP: 1.7,
  JPY: 0.009,
  CNY: 0.185,
  AUD: 0.87,
};
