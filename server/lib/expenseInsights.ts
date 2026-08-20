// AI insights for the Expenses module. Deterministic first: the context
// given to the model is built entirely from real rows already queried from
// the database (never invented), then the model is only asked to notice
// patterns in that exact data -- structured output, not free text, so the
// UI never has to trust or parse prose.

import { prisma } from "../db.js";
import { toSgd } from "./convert.js";
import { callStructured } from "./llm.js";

const SYSTEM_PROMPT = `You are a finance assistant reviewing a small company's expense records. You are given a CONTEXT block listing real expense transactions (date, vendor, category, amount in SGD, status, submitter) -- already converted to SGD so amounts are directly comparable.

Rules:
1. Only reference expenses that literally appear in CONTEXT. Never invent a vendor, amount, or date.
2. Identify genuinely useful patterns: which categories or vendors dominate spend, any expenses that look like likely duplicates (same vendor + very similar amount within a few days of each other), any single expense that's unusually large relative to the rest, and any categories trending up compared to earlier in the period.
3. Be concise and concrete -- reference actual vendor names and SGD amounts from CONTEXT, not vague generalities.
4. If nothing notable stands out for a category (e.g. no anomalies), say so briefly rather than forcing a finding.
5. Suggestions should be practical cost-control ideas grounded in what CONTEXT actually shows -- not generic advice.

You must respond by calling the emit_expense_insights tool.`;

const TOOL = {
  name: "emit_expense_insights",
  description: "Emit structured insights about the expense data.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One or two sentences on overall spend for the period covered.",
      },
      highlights: {
        type: "array",
        items: { type: "string" },
        description:
          "Notable spending patterns -- top categories/vendors, trends.",
      },
      anomalies: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific expenses worth a second look -- likely duplicates, unusually large amounts. Empty array if nothing stands out.",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: "Practical, concrete cost-control suggestions.",
      },
    },
    required: ["summary", "highlights", "anomalies", "suggestions"],
  },
};

export interface ExpenseInsights {
  summary: string;
  highlights: string[];
  anomalies: string[];
  suggestions: string[];
  expenseCount: number;
  totalSgd: number;
}

export async function generateExpenseInsights(opts: {
  fiscalYear?: number;
  department?: string;
}): Promise<ExpenseInsights> {
  const [rates, expenses] = await Promise.all([
    prisma.exchangeRate
      .findMany()
      .then((rows) =>
        Object.fromEntries(rows.map((r) => [r.currency, r.rateToSgd])),
      ),
    prisma.expense.findMany({
      where: {
        fiscalYear: opts.fiscalYear,
        department: opts.department || undefined,
      },
      include: {
        lineItems: { include: { category: true } },
        submittedBy: true,
      },
      orderBy: { date: "desc" },
      take: 150,
    }),
  ]);

  if (expenses.length === 0) {
    return {
      summary: "No expenses recorded yet for this period.",
      highlights: [],
      anomalies: [],
      suggestions: [],
      expenseCount: 0,
      totalSgd: 0,
    };
  }

  let totalSgd = 0;
  const lines = expenses.map((e) => {
    const sgd = toSgd(e.amountTotal, e.currency, rates);
    totalSgd += sgd;
    const categories =
      [...new Set(e.lineItems.map((l) => l.category.name))].join(", ") ||
      "Uncategorised";
    return `${e.date.toISOString().slice(0, 10)} | ${e.vendor} | ${categories} | SGD ${sgd.toFixed(2)} | ${e.status} | submitted by ${e.submittedBy.name}${e.department ? ` | dept: ${e.department}` : ""}`;
  });

  const context = `Expenses (most recent ${expenses.length}, newest first):\n${lines.join("\n")}\n\nTotal: SGD ${totalSgd.toFixed(2)} across ${expenses.length} expense(s).`;

  const result = await callStructured<{
    summary: string;
    highlights: string[];
    anomalies: string[];
    suggestions: string[];
  }>({
    system: SYSTEM_PROMPT,
    userText: context,
    tool: TOOL,
    maxTokens: 1024,
  });

  return {
    ...result,
    expenseCount: expenses.length,
    totalSgd: Math.round(totalSgd * 100) / 100,
  };
}
