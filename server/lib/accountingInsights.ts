// AI insights for the Accounting module. Same discipline as expense
// insights: the context is built deterministically from real P&L/overdue
// data already computed in this file's own functions, and the model is
// only asked to narrate patterns in that exact data.

import { accountingDb } from "../accountingDb.js";
import { computeProfitAndLoss, decToNum } from "./accounting.js";
import { callStructured } from "./llm.js";

const SYSTEM_PROMPT = `You are a finance assistant reviewing a small company's bookkeeping. You are given a CONTEXT block with: this period's income/expense breakdown, and lists of overdue/outstanding invoices and bills -- all real figures already computed from the company's actual records.

Rules:
1. Only reference figures, customers, and vendors that literally appear in CONTEXT. Never invent an amount or name.
2. Focus on cash flow health: is more owed to the company than the company owes, is any single customer or vendor a concentration risk, are there overdue amounts that need chasing.
3. Be concrete -- cite actual SGD amounts and names from CONTEXT.
4. Keep the tone plain-English, written for someone with no accounting background -- avoid jargon like "receivables" or "payables" in the output text itself (say "money owed to you" / "money you owe" instead).
5. If a category has nothing notable, say so briefly rather than forcing a finding.

You must respond by calling the emit_accounting_insights tool.`;

const TOOL = {
  name: "emit_accounting_insights",
  description: "Emit structured insights about the company's finances.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One or two sentences on overall financial health this period.",
      },
      highlights: {
        type: "array",
        items: { type: "string" },
        description: "Notable patterns in income/expenses this period.",
      },
      risks: {
        type: "array",
        items: { type: "string" },
        description:
          "Cash flow risks -- overdue amounts, customer/vendor concentration. Empty array if nothing stands out.",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: "Practical, concrete suggestions grounded in CONTEXT.",
      },
    },
    required: ["summary", "highlights", "risks", "suggestions"],
  },
};

export interface AccountingInsights {
  summary: string;
  highlights: string[];
  risks: string[];
  suggestions: string[];
  totalOwedToYou: number;
  totalYouOwe: number;
}

export async function generateAccountingInsights(): Promise<AccountingInsights> {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);

  const [pnl, invoices, bills] = await Promise.all([
    computeProfitAndLoss({ from, to }),
    accountingDb.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: true, lines: true, payments: true },
    }),
    accountingDb.bill.findMany({
      where: { status: { in: ["RECEIVED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { vendor: true, lines: true, payments: true },
    }),
  ]);

  const outstandingInvoices = invoices
    .map((inv) => {
      const total = inv.lines.reduce(
        (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
        0,
      );
      const paid = inv.payments.reduce((s, p) => s + decToNum(p.amount), 0);
      const daysOverdue = Math.floor(
        (Date.now() - inv.dueDate.getTime()) / 86400000,
      );
      return {
        customer: inv.customer.name,
        outstanding: total - paid,
        daysOverdue,
      };
    })
    .filter((i) => i.outstanding > 0);

  const outstandingBills = bills
    .map((b) => {
      const total = b.lines.reduce(
        (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
        0,
      );
      const paid = b.payments.reduce((s, p) => s + decToNum(p.amount), 0);
      const daysOverdue = Math.floor(
        (Date.now() - b.dueDate.getTime()) / 86400000,
      );
      return { vendor: b.vendor.name, outstanding: total - paid, daysOverdue };
    })
    .filter((b) => b.outstanding > 0);

  const totalOwedToYou =
    Math.round(
      outstandingInvoices.reduce((s, i) => s + i.outstanding, 0) * 100,
    ) / 100;
  const totalYouOwe =
    Math.round(outstandingBills.reduce((s, b) => s + b.outstanding, 0) * 100) /
    100;

  if (
    pnl.income.length === 0 &&
    pnl.expense.length === 0 &&
    outstandingInvoices.length === 0 &&
    outstandingBills.length === 0
  ) {
    return {
      summary: "No transactions recorded yet -- nothing to analyse.",
      highlights: [],
      risks: [],
      suggestions: [],
      totalOwedToYou: 0,
      totalYouOwe: 0,
    };
  }

  const incomeLines = pnl.income
    .filter((r) => r.amount !== 0)
    .map((r) => `${r.name}: SGD ${r.amount.toFixed(2)}`);
  const expenseLines = pnl.expense
    .filter((r) => r.amount !== 0)
    .map((r) => `${r.name}: SGD ${r.amount.toFixed(2)}`);
  const invoiceLines = outstandingInvoices.map(
    (i) =>
      `${i.customer} owes SGD ${i.outstanding.toFixed(2)}${i.daysOverdue > 0 ? ` (${i.daysOverdue} days overdue)` : ""}`,
  );
  const billLines = outstandingBills.map(
    (b) =>
      `You owe ${b.vendor} SGD ${b.outstanding.toFixed(2)}${b.daysOverdue > 0 ? ` (${b.daysOverdue} days overdue)` : ""}`,
  );

  const context = `Last 3 months income:\n${incomeLines.join("\n") || "(none)"}\n\nLast 3 months expenses:\n${expenseLines.join("\n") || "(none)"}\n\nNet profit/(loss) last 3 months: SGD ${pnl.netProfit.toFixed(2)}\n\nMoney owed to you (unpaid invoices):\n${invoiceLines.join("\n") || "(none outstanding)"}\n\nMoney you owe (unpaid bills):\n${billLines.join("\n") || "(none outstanding)"}`;

  const result = await callStructured<{
    summary: string;
    highlights: string[];
    risks: string[];
    suggestions: string[];
  }>({
    system: SYSTEM_PROMPT,
    userText: context,
    tool: TOOL,
    maxTokens: 1024,
  });

  return { ...result, totalOwedToYou, totalYouOwe };
}
