import type { ExchangeRate } from "../api/types";

// 1 unit of `currency` = the stored rate in SGD. SGD itself is always 1.
export function toSgd(
  amount: number,
  currency: string,
  rates: ExchangeRate[],
): number {
  if (currency === "SGD") return amount;
  const rate = rates.find((r) => r.currency === currency)?.rateToSgd;
  return rate ? amount * rate : amount;
}
