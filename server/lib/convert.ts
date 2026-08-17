// 1 unit of `currency` = `rates[currency]` SGD. SGD itself is always 1.
export function toSgd(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (currency === "SGD") return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}
