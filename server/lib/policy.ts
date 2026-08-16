import type {
  ExpenseCategory,
  ExpenseLineItem,
  Settings,
} from "@prisma/client";

export interface PolicyCheckResult {
  flagged: boolean;
  reasons: string[];
}

// Evaluates the configurable policy rules against an expense: a missing
// receipt above the configured threshold, and any category spending limit
// exceeded by a line item on this expense.
export function checkPolicy(
  amountTotal: number,
  receiptCount: number,
  lineItems: (Pick<ExpenseLineItem, "amount" | "categoryId"> & {
    category?: Pick<ExpenseCategory, "name" | "spendingLimitPerExpense">;
  })[],
  settings: Pick<Settings, "receiptRequiredAbove">,
): PolicyCheckResult {
  const reasons: string[] = [];

  if (amountTotal > settings.receiptRequiredAbove && receiptCount === 0) {
    reasons.push(
      `Missing receipt for an expense over ${settings.receiptRequiredAbove} (total: ${amountTotal})`,
    );
  }

  for (const item of lineItems) {
    const limit = item.category?.spendingLimitPerExpense;
    if (limit != null && item.amount > limit) {
      reasons.push(
        `Category "${item.category?.name ?? item.categoryId}" limit of ${limit} exceeded (${item.amount})`,
      );
    }
  }

  return { flagged: reasons.length > 0, reasons };
}
