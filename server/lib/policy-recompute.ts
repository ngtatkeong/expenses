import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { checkPolicy } from "./policy.js";

type Client = Prisma.TransactionClient | typeof prisma;

// Recomputes and persists an expense's `flagged`/`flagReason` fields from
// the current policy rules (missing-receipt threshold, category limits).
// Shared between the expenses and receipts routes, since either a line
// item change or a receipt add/remove can change the outcome.
export async function recomputeExpenseFlags(
  expenseId: string,
  client: Client = prisma,
) {
  const settings = await client.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const expense = await client.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { lineItems: { include: { category: true } }, receipts: true },
  });
  const { flagged, reasons } = checkPolicy(
    expense.amountTotal,
    expense.receipts.length,
    expense.lineItems,
    settings,
  );
  await client.expense.update({
    where: { id: expenseId },
    data: { flagged, flagReason: reasons.join("; ") || null },
  });
}
