// AI helpers for the Expenses module: natural-language/receipt-text entry,
// a pre-submit policy sanity check, and a one-line approval note. Same
// discipline as expenseInsights.ts -- context is built deterministically
// from real DB rows, the model only ever transforms/reasons over that
// exact context via forced structured output.

import { prisma } from "../db.js";
import { toSgd } from "./convert.js";
import { callStructured } from "./llm.js";

// ---- Natural-language / receipt-text entry ----

const PARSE_SYSTEM_PROMPT = `You extract structured expense-claim fields from a piece of text -- either a plain-language description written by an employee ("lunch with client at Din Tai Fung yesterday, $45") or raw OCR text from a photographed receipt (messy, may include store headers, item lines, totals, tax lines).

Rules:
1. Find the vendor/merchant name, the total amount, the currency (default SGD if not stated or you can't tell), and the date (if a relative date like "yesterday" is used, you don't know today's date, so leave date null and let the caller default it).
2. Pick the single best-matching category from the CATEGORIES list by id. If nothing fits well, leave categoryId null -- never invent a category id not in the list.
3. For OCR text, prefer the TOTAL/GRAND TOTAL line over individual item lines for the amount.
4. Write a short one-line description of what this expense was for.
5. Set confidence to "high" only if the vendor and amount are unambiguous in the text.

You must respond by calling the emit_parsed_expense tool.`;

const PARSE_TOOL = {
  name: "emit_parsed_expense",
  description: "Emit the extracted expense fields.",
  input_schema: {
    type: "object",
    properties: {
      vendor: { type: "string" },
      amountTotal: { type: "number" },
      currency: { type: "string" },
      date: {
        type: "string",
        description:
          "ISO date YYYY-MM-DD if explicitly stated in the text, otherwise omit.",
      },
      categoryId: { type: "string" },
      description: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: [
      "vendor",
      "amountTotal",
      "currency",
      "description",
      "confidence",
    ],
  },
};

export interface ParsedExpense {
  vendor: string;
  amountTotal: number;
  currency: string;
  date?: string;
  categoryId?: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

export async function parseExpenseText(text: string): Promise<ParsedExpense> {
  const categories = await prisma.expenseCategory.findMany({
    where: { active: true },
  });
  const categoryList = categories.map((c) => `- ${c.id}: ${c.name}`).join("\n");
  const userText = `TEXT:\n${text}\n\nCATEGORIES:\n${categoryList}`;
  const result = await callStructured<ParsedExpense>({
    system: PARSE_SYSTEM_PROMPT,
    userText,
    tool: PARSE_TOOL,
    maxTokens: 512,
  });
  // Guard against a hallucinated category id that isn't actually in the list.
  if (
    result.categoryId &&
    !categories.some((c) => c.id === result.categoryId)
  ) {
    delete result.categoryId;
  }
  return result;
}

// ---- Pre-submit policy check ----

const POLICY_SYSTEM_PROMPT = `You review a draft expense claim against the employee's recent expense history, looking only for things worth a second look before they submit it -- not a compliance ruling.

Rules:
1. Only reference expenses that literally appear in RECENT EXPENSES. Never invent one.
2. Flag: a likely duplicate (same/very similar vendor and amount within the last ~14 days), or an amount that's a clear outlier vs this employee's typical spend in this category.
3. If nothing stands out, return an empty warnings array -- do not force a finding.
4. Keep each warning to one short sentence, citing the actual comparable expense (vendor, amount, date).

You must respond by calling the emit_policy_check tool.`;

const POLICY_TOOL = {
  name: "emit_policy_check",
  description: "Emit any pre-submit warnings for this draft expense.",
  input_schema: {
    type: "object",
    properties: {
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["warnings"],
  },
};

export async function checkExpensePolicy(opts: {
  submittedById: string;
  vendor: string;
  amountTotal: number;
  currency: string;
  categoryId: string;
  date: string;
}): Promise<{ warnings: string[] }> {
  const [rates, category, recent] = await Promise.all([
    prisma.exchangeRate
      .findMany()
      .then((rows) =>
        Object.fromEntries(rows.map((r) => [r.currency, r.rateToSgd])),
      ),
    prisma.expenseCategory.findUnique({ where: { id: opts.categoryId } }),
    prisma.expense.findMany({
      where: { submittedById: opts.submittedById },
      include: { lineItems: { include: { category: true } } },
      orderBy: { date: "desc" },
      take: 40,
    }),
  ]);

  const draftSgd = toSgd(opts.amountTotal, opts.currency, rates);

  // Hard limit check is deterministic, no AI needed.
  const warnings: string[] = [];
  if (
    category?.spendingLimitPerExpense != null &&
    opts.amountTotal > category.spendingLimitPerExpense
  ) {
    warnings.push(
      `This exceeds the ${category.name} per-expense limit of ${category.spendingLimitPerExpense} (this expense is ${opts.amountTotal}).`,
    );
  }

  if (recent.length === 0) {
    return { warnings };
  }

  const lines = recent.map((e) => {
    const sgd = toSgd(e.amountTotal, e.currency, rates);
    const cats = [...new Set(e.lineItems.map((l) => l.category.name))].join(
      ", ",
    );
    return `${e.date.toISOString().slice(0, 10)} | ${e.vendor} | ${cats} | SGD ${sgd.toFixed(2)}`;
  });

  const userText = `DRAFT EXPENSE:\nVendor: ${opts.vendor}\nAmount: SGD ${draftSgd.toFixed(2)}\nCategory: ${category?.name}\nDate: ${opts.date}\n\nRECENT EXPENSES for this employee:\n${lines.join("\n")}`;

  const result = await callStructured<{ warnings: string[] }>({
    system: POLICY_SYSTEM_PROMPT,
    userText,
    tool: POLICY_TOOL,
    maxTokens: 512,
  });

  return { warnings: [...warnings, ...result.warnings] };
}

// ---- Approval assistant note ----

const APPROVAL_SYSTEM_PROMPT = `You help a manager quickly triage a pending expense approval. You are given the pending expense and a few of the same employee's recently approved expenses for comparison.

Rules:
1. Only reference expenses that literally appear in the context. Never invent one.
2. Write ONE short sentence a manager can read in under 2 seconds: either reassurance ("in line with their usual X spend") or a flag ("higher than their usual Y, worth asking about").
3. Set riskLevel "low" if it looks routine, "medium" if there's something mildly worth noting, "high" if it looks like a likely duplicate or a clear outlier.

You must respond by calling the emit_approval_note tool.`;

const APPROVAL_TOOL = {
  name: "emit_approval_note",
  description: "Emit a one-line triage note for this pending expense.",
  input_schema: {
    type: "object",
    properties: {
      note: { type: "string" },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["note", "riskLevel"],
  },
};

export async function generateApprovalNote(expenseId: string): Promise<{
  note: string;
  riskLevel: "low" | "medium" | "high";
}> {
  const [rates, expense] = await Promise.all([
    prisma.exchangeRate
      .findMany()
      .then((rows) =>
        Object.fromEntries(rows.map((r) => [r.currency, r.rateToSgd])),
      ),
    prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: {
        lineItems: { include: { category: true } },
        submittedBy: true,
      },
    }),
  ]);

  const recent = await prisma.expense.findMany({
    where: {
      submittedById: expense.submittedById,
      status: { in: ["APPROVED", "PAID"] },
      id: { not: expenseId },
    },
    include: { lineItems: { include: { category: true } } },
    orderBy: { date: "desc" },
    take: 20,
  });

  const pendingSgd = toSgd(expense.amountTotal, expense.currency, rates);
  const pendingCats = [
    ...new Set(expense.lineItems.map((l) => l.category.name)),
  ].join(", ");

  if (recent.length === 0) {
    return {
      note: `First expense on record for ${expense.submittedBy.name} -- no history to compare against.`,
      riskLevel: "low",
    };
  }

  const lines = recent.map((e) => {
    const sgd = toSgd(e.amountTotal, e.currency, rates);
    const cats = [...new Set(e.lineItems.map((l) => l.category.name))].join(
      ", ",
    );
    return `${e.date.toISOString().slice(0, 10)} | ${e.vendor} | ${cats} | SGD ${sgd.toFixed(2)}`;
  });

  const userText = `PENDING EXPENSE:\n${expense.vendor} | ${pendingCats} | SGD ${pendingSgd.toFixed(2)} | submitted by ${expense.submittedBy.name}\n\n${expense.submittedBy.name}'s recent approved expenses:\n${lines.join("\n")}`;

  return callStructured<{ note: string; riskLevel: "low" | "medium" | "high" }>(
    {
      system: APPROVAL_SYSTEM_PROMPT,
      userText,
      tool: APPROVAL_TOOL,
      maxTokens: 256,
    },
  );
}

// ---- Receipt-vs-claim mismatch check ----

const RECEIPT_MATCH_SYSTEM_PROMPT = `Compare the OCR text from an uploaded receipt image against the amount and vendor claimed on an expense record. Decide if they plausibly match.

Rules:
1. OCR text is often messy -- allow for minor formatting differences, but the vendor name and total amount should be recognizably the same transaction.
2. Only flag a mismatch if the receipt clearly shows a different vendor or a total amount that doesn't reasonably match the claimed amount (allow small rounding/tip differences).
3. If the OCR text is too garbled to read a vendor or amount at all, say so rather than guessing a mismatch.

You must respond by calling the emit_receipt_check tool.`;

const RECEIPT_MATCH_TOOL = {
  name: "emit_receipt_check",
  description: "Emit whether the receipt matches the claimed expense.",
  input_schema: {
    type: "object",
    properties: {
      matches: { type: "boolean" },
      note: {
        type: "string",
        description: "One short sentence explaining the match or mismatch.",
      },
    },
    required: ["matches", "note"],
  },
};

export async function checkReceiptMatch(
  expenseId: string,
  receiptText: string,
): Promise<{ matches: boolean; note: string }> {
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
  });
  const userText = `CLAIMED EXPENSE:\nVendor: ${expense.vendor}\nAmount: ${expense.amountTotal} ${expense.currency}\n\nRECEIPT OCR TEXT:\n${receiptText}`;

  return callStructured<{ matches: boolean; note: string }>({
    system: RECEIPT_MATCH_SYSTEM_PROMPT,
    userText,
    tool: RECEIPT_MATCH_TOOL,
    maxTokens: 300,
  });
}
