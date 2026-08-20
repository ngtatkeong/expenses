// AI helpers for the Accounting module: natural-language transaction entry,
// payment reminder drafting, a cash-flow forecast narrative, and bank
// statement reconciliation. Same discipline throughout: context built
// deterministically from real records, model only reasons over that exact
// context via forced structured output.

import { accountingDb } from "../accountingDb.js";
import { computeProfitAndLoss, decToNum } from "./accounting.js";
import { callStructured } from "./llm.js";

// ---- Natural-language transaction entry ----

const PARSE_TXN_SYSTEM_PROMPT = `You extract structured fields from a plain-language description of a sale or purchase written by a small business owner (e.g. "received $2,000 from Acme for consulting work" or "paid $150 to SP Group for electricity").

Rules:
1. Find the counterparty name (customer if this is a SALE, vendor if this is a PURCHASE), the line item description, and the amount.
2. Pick the single best-matching account from the ACCOUNTS list by id for the income/expense category. If nothing fits well, leave accountId null -- never invent an id not in the list.
3. If the counterparty name matches an existing entry in the KNOWN PARTIES list (case-insensitively, allowing for minor variation), return its exact id as existingPartyId. Otherwise leave it null -- a new one will be created with the name you extracted.

You must respond by calling the emit_parsed_transaction tool.`;

const PARSE_TXN_TOOL = {
  name: "emit_parsed_transaction",
  description: "Emit the extracted transaction fields.",
  input_schema: {
    type: "object",
    properties: {
      partyName: { type: "string" },
      existingPartyId: { type: "string" },
      description: { type: "string" },
      amount: { type: "number" },
      accountId: { type: "string" },
    },
    required: ["partyName", "description", "amount"],
  },
};

export interface ParsedTransaction {
  partyName: string;
  existingPartyId?: string;
  description: string;
  amount: number;
  accountId?: string;
}

export async function parseTransactionText(
  text: string,
  kind: "sale" | "expense",
): Promise<ParsedTransaction> {
  const [accounts, parties] =
    kind === "sale"
      ? await Promise.all([
          accountingDb.account.findMany({
            where: { type: "INCOME", active: true },
          }),
          accountingDb.customer.findMany({ where: { active: true } }),
        ])
      : await Promise.all([
          accountingDb.account.findMany({
            where: { type: { in: ["EXPENSE", "ASSET"] }, active: true },
          }),
          accountingDb.vendor.findMany({ where: { active: true } }),
        ]);

  const accountList = accounts.map((a) => `- ${a.id}: ${a.name}`).join("\n");
  const partyList =
    parties.map((p) => `- ${p.id}: ${p.name}`).join("\n") || "(none yet)";
  const userText = `KIND: ${kind === "sale" ? "SALE (money coming in)" : "PURCHASE (money going out)"}\n\nTEXT:\n${text}\n\nACCOUNTS:\n${accountList}\n\nKNOWN PARTIES:\n${partyList}`;

  const result = await callStructured<ParsedTransaction>({
    system: PARSE_TXN_SYSTEM_PROMPT,
    userText,
    tool: PARSE_TXN_TOOL,
    maxTokens: 512,
  });

  if (result.accountId && !accounts.some((a) => a.id === result.accountId)) {
    delete result.accountId;
  }
  if (
    result.existingPartyId &&
    !parties.some((p) => p.id === result.existingPartyId)
  ) {
    delete result.existingPartyId;
  }
  return result;
}

// ---- Payment reminder drafting ----

const REMINDER_SYSTEM_PROMPT = `Draft a short, polite payment reminder message for an overdue invoice. Plain business English, not stiff legal language. Reference the actual invoice number, amount, and days overdue given. End with a soft call to action. Do not sign off with a name/company (the user will add that themselves).

You must respond by calling the emit_reminder tool.`;

const REMINDER_TOOL = {
  name: "emit_reminder",
  description: "Emit the drafted reminder message.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
  },
};

export async function draftPaymentReminder(
  invoiceId: string,
): Promise<{ message: string }> {
  const invoice = await accountingDb.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true, lines: true, payments: true },
  });
  const total = invoice.lines.reduce(
    (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
    0,
  );
  const paid = invoice.payments.reduce((s, p) => s + decToNum(p.amount), 0);
  const outstanding = total - paid;
  const daysOverdue = Math.floor(
    (Date.now() - invoice.dueDate.getTime()) / 86400000,
  );

  const userText = `Invoice ${invoice.invoiceNumber} to ${invoice.customer.name}, SGD ${outstanding.toFixed(2)} outstanding, due date ${invoice.dueDate.toISOString().slice(0, 10)}, ${daysOverdue > 0 ? `${daysOverdue} days overdue` : "not yet overdue"}.`;

  return callStructured<{ message: string }>({
    system: REMINDER_SYSTEM_PROMPT,
    userText,
    tool: REMINDER_TOOL,
    maxTokens: 400,
  });
}

// ---- Cash flow forecast ----

const FORECAST_SYSTEM_PROMPT = `You are given a small company's outstanding invoices/bills (with due dates) and its current cash position. Write a short plain-English narrative (2-4 sentences, no jargon) about what their cash position looks like over the next 30/60/90 days based purely on this data -- do not invent any figures not given to you.

You must respond by calling the emit_forecast_narrative tool.`;

const FORECAST_TOOL = {
  name: "emit_forecast_narrative",
  description: "Emit the plain-English cash flow narrative.",
  input_schema: {
    type: "object",
    properties: {
      narrative: { type: "string" },
    },
    required: ["narrative"],
  },
};

export interface CashFlowForecast {
  currentCashSgd: number;
  periods: {
    label: string;
    expectedIn: number;
    expectedOut: number;
    projectedCash: number;
  }[];
  narrative: string;
}

export async function computeCashFlowForecast(): Promise<CashFlowForecast> {
  const [bankAccounts, invoices, bills] = await Promise.all([
    accountingDb.account.findMany({ where: { type: "ASSET", active: true } }),
    accountingDb.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { lines: true, payments: true },
    }),
    accountingDb.bill.findMany({
      where: { status: { in: ["RECEIVED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { lines: true, payments: true },
    }),
  ]);

  const bankLines = await accountingDb.journalLine.findMany({
    where: {
      accountId: {
        in: bankAccounts
          .filter((a) => !/receivable/i.test(a.name))
          .map((a) => a.id),
      },
    },
  });
  const currentCashSgd =
    Math.round(
      bankLines.reduce(
        (s, l) => s + decToNum(l.debit) - decToNum(l.credit),
        0,
      ) * 100,
    ) / 100;

  const receivables = invoices
    .map((inv) => {
      const total = inv.lines.reduce(
        (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
        0,
      );
      const paid = inv.payments.reduce((s, p) => s + decToNum(p.amount), 0);
      return { due: inv.dueDate, amount: total - paid };
    })
    .filter((r) => r.amount > 0);

  const payables = bills
    .map((b) => {
      const total = b.lines.reduce(
        (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
        0,
      );
      const paid = b.payments.reduce((s, p) => s + decToNum(p.amount), 0);
      return { due: b.dueDate, amount: total - paid };
    })
    .filter((p) => p.amount > 0);

  const now = Date.now();
  const windows = [
    { label: "Next 30 days", days: 30 },
    { label: "Next 60 days", days: 60 },
    { label: "Next 90 days", days: 90 },
  ];

  let runningCash = currentCashSgd;
  const periods = windows.map((w, idx) => {
    const prevDays = idx === 0 ? 0 : windows[idx - 1].days;
    const cutoff = now + w.days * 86400000;
    const prevCutoff = now + prevDays * 86400000;
    const expectedIn =
      Math.round(
        receivables
          .filter(
            (r) => r.due.getTime() > prevCutoff && r.due.getTime() <= cutoff,
          )
          .reduce((s, r) => s + r.amount, 0) * 100,
      ) / 100;
    const expectedOut =
      Math.round(
        payables
          .filter(
            (p) => p.due.getTime() > prevCutoff && p.due.getTime() <= cutoff,
          )
          .reduce((s, p) => s + p.amount, 0) * 100,
      ) / 100;
    runningCash =
      Math.round((runningCash + expectedIn - expectedOut) * 100) / 100;
    return {
      label: w.label,
      expectedIn,
      expectedOut,
      projectedCash: runningCash,
    };
  });

  const userText = `Current cash position: SGD ${currentCashSgd.toFixed(2)}.\n\n${periods
    .map(
      (p) =>
        `${p.label}: expecting SGD ${p.expectedIn.toFixed(2)} in, SGD ${p.expectedOut.toFixed(2)} out, projected cash SGD ${p.projectedCash.toFixed(2)}.`,
    )
    .join("\n")}`;

  const { narrative } = await callStructured<{ narrative: string }>({
    system: FORECAST_SYSTEM_PROMPT,
    userText,
    tool: FORECAST_TOOL,
    maxTokens: 400,
  });

  return { currentCashSgd, periods, narrative };
}

// ---- Bank statement reconciliation ----

const RECONCILE_SYSTEM_PROMPT = `You are given raw bank statement text (one transaction per line, messy formatting is fine) and lists of outstanding invoices (money owed TO the company) and outstanding bills (money the company owes). Match each statement line that looks like it could be a customer payment or vendor payment to the correct outstanding invoice/bill.

Rules:
1. Only match against invoices/bills that literally appear in the lists given -- never invent one.
2. Match primarily on amount (exact or very close) and any name hint in the statement line description.
3. Only report a match if reasonably confident (amount matches closely and there's a plausible name link, or amount matches exactly and only one candidate exists).
4. Every statement line must appear in your response, either as a match or in unmatchedLines.

You must respond by calling the emit_reconciliation tool.`;

const RECONCILE_TOOL = {
  name: "emit_reconciliation",
  description: "Emit the reconciliation matches.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            statementLine: { type: "string" },
            type: { type: "string", enum: ["invoice", "bill"] },
            id: { type: "string" },
            amount: { type: "number" },
            confidence: { type: "string", enum: ["high", "medium"] },
          },
          required: ["statementLine", "type", "id", "amount", "confidence"],
        },
      },
      unmatchedLines: { type: "array", items: { type: "string" } },
    },
    required: ["matches", "unmatchedLines"],
  },
};

export interface ReconciliationMatch {
  statementLine: string;
  type: "invoice" | "bill";
  id: string;
  amount: number;
  confidence: "high" | "medium";
  label: string;
}

export async function reconcileStatement(statementText: string): Promise<{
  matches: ReconciliationMatch[];
  unmatchedLines: string[];
}> {
  const [invoices, bills] = await Promise.all([
    accountingDb.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: true, lines: true, payments: true },
    }),
    accountingDb.bill.findMany({
      where: { status: { in: ["RECEIVED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { vendor: true, lines: true, payments: true },
    }),
  ]);

  const invoiceList = invoices
    .map((inv) => {
      const total = inv.lines.reduce(
        (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
        0,
      );
      const paid = inv.payments.reduce((s, p) => s + decToNum(p.amount), 0);
      return {
        id: inv.id,
        label: `${inv.invoiceNumber} (${inv.customer.name})`,
        outstanding: total - paid,
      };
    })
    .filter((i) => i.outstanding > 0);

  const billList = bills
    .map((b) => {
      const total = b.lines.reduce(
        (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
        0,
      );
      const paid = b.payments.reduce((s, p) => s + decToNum(p.amount), 0);
      return {
        id: b.id,
        label: `${b.billNumber} (${b.vendor.name})`,
        outstanding: total - paid,
      };
    })
    .filter((b) => b.outstanding > 0);

  const userText = `BANK STATEMENT LINES:\n${statementText}\n\nOUTSTANDING INVOICES (money owed TO the company):\n${invoiceList.map((i) => `- id ${i.id}: ${i.label}, SGD ${i.outstanding.toFixed(2)} outstanding`).join("\n") || "(none)"}\n\nOUTSTANDING BILLS (money the company owes):\n${billList.map((b) => `- id ${b.id}: ${b.label}, SGD ${b.outstanding.toFixed(2)} outstanding`).join("\n") || "(none)"}`;

  const result = await callStructured<{
    matches: {
      statementLine: string;
      type: "invoice" | "bill";
      id: string;
      amount: number;
      confidence: "high" | "medium";
    }[];
    unmatchedLines: string[];
  }>({
    system: RECONCILE_SYSTEM_PROMPT,
    userText,
    tool: RECONCILE_TOOL,
    maxTokens: 1536,
  });

  const byId = new Map([
    ...invoiceList.map((i) => [i.id, i.label] as const),
    ...billList.map((b) => [b.id, b.label] as const),
  ]);
  const validMatches = result.matches
    .filter((m) =>
      (m.type === "invoice" ? invoiceList : billList).some(
        (x) => x.id === m.id,
      ),
    )
    .map((m) => ({ ...m, label: byId.get(m.id) ?? "" }));

  return { matches: validMatches, unmatchedLines: result.unmatchedLines };
}

// ---- "Record something else" natural-language entry ----

const PARSE_OTHER_SYSTEM_PROMPT = `You extract structured fields from a plain-language description of a money movement that isn't a sale or purchase (e.g. "owner put in $5,000 cash as capital" or "moved $1,000 from the bank account to petty cash" or "bank charged a $20 fee").

Rules:
1. Every transaction moves money INTO one account and OUT OF another. Pick the single best-matching "into" account and "out of" account from the ACCOUNTS list by id -- never invent an id not in the list. If you can only confidently identify one side, leave the other null.
2. Write a short one-line description of what happened.
3. Find the amount.

You must respond by calling the emit_parsed_other_transaction tool.`;

const PARSE_OTHER_TOOL = {
  name: "emit_parsed_other_transaction",
  description: "Emit the extracted transaction fields.",
  input_schema: {
    type: "object",
    properties: {
      description: { type: "string" },
      amount: { type: "number" },
      toAccountId: { type: "string" },
      fromAccountId: { type: "string" },
    },
    required: ["description", "amount"],
  },
};

export interface ParsedOtherTransaction {
  description: string;
  amount: number;
  toAccountId?: string;
  fromAccountId?: string;
}

export async function parseOtherTransactionText(
  text: string,
): Promise<ParsedOtherTransaction> {
  const accounts = await accountingDb.account.findMany({
    where: { active: true },
  });
  const accountList = accounts
    .map((a) => `- ${a.id}: ${a.name} (${a.type})`)
    .join("\n");
  const userText = `TEXT:\n${text}\n\nACCOUNTS:\n${accountList}`;

  const result = await callStructured<ParsedOtherTransaction>({
    system: PARSE_OTHER_SYSTEM_PROMPT,
    userText,
    tool: PARSE_OTHER_TOOL,
    maxTokens: 512,
  });

  if (
    result.toAccountId &&
    !accounts.some((a) => a.id === result.toAccountId)
  ) {
    delete result.toAccountId;
  }
  if (
    result.fromAccountId &&
    !accounts.some((a) => a.id === result.fromAccountId)
  ) {
    delete result.fromAccountId;
  }
  return result;
}

// ---- Payment natural-language entry ----

const PARSE_PAYMENT_SYSTEM_PROMPT = `You extract structured fields from a plain-language description of a payment being received or made (e.g. "customer paid $2,000 for INV-000123" or "paid SP Group $150 today via GIRO").

Rules:
1. Decide whether this is money RECEIVED (from a customer, against an invoice) or PAID (to a vendor, against a bill).
2. Match it to the single best entry in the OUTSTANDING INVOICES or OUTSTANDING BILLS list by id -- by invoice/bill number if mentioned, otherwise by customer/vendor name and amount. Never invent an id not in the lists. If you can't confidently match one, leave both invoiceId and billId null.
3. Find the amount and payment method if mentioned (e.g. bank transfer, cash, GIRO, PayNow, cheque).

You must respond by calling the emit_parsed_payment tool.`;

const PARSE_PAYMENT_TOOL = {
  name: "emit_parsed_payment",
  description: "Emit the extracted payment fields.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["RECEIVED", "PAID"] },
      invoiceId: { type: "string" },
      billId: { type: "string" },
      amount: { type: "number" },
      method: { type: "string" },
    },
    required: ["type", "amount"],
  },
};

export interface ParsedPayment {
  type: "RECEIVED" | "PAID";
  invoiceId?: string;
  billId?: string;
  amount: number;
  method?: string;
}

export async function parsePaymentText(text: string): Promise<ParsedPayment> {
  const [invoices, bills] = await Promise.all([
    accountingDb.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: true, lines: true, payments: true },
    }),
    accountingDb.bill.findMany({
      where: { status: { in: ["RECEIVED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { vendor: true, lines: true, payments: true },
    }),
  ]);

  const invoiceList = invoices.map((inv) => {
    const total = inv.lines.reduce(
      (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
      0,
    );
    const paid = inv.payments.reduce((s, p) => s + decToNum(p.amount), 0);
    return `- id ${inv.id}: ${inv.invoiceNumber} (${inv.customer.name}), SGD ${(total - paid).toFixed(2)} outstanding`;
  });
  const billList = bills.map((b) => {
    const total = b.lines.reduce(
      (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
      0,
    );
    const paid = b.payments.reduce((s, p) => s + decToNum(p.amount), 0);
    return `- id ${b.id}: ${b.billNumber} (${b.vendor.name}), SGD ${(total - paid).toFixed(2)} outstanding`;
  });

  const userText = `TEXT:\n${text}\n\nOUTSTANDING INVOICES:\n${invoiceList.join("\n") || "(none)"}\n\nOUTSTANDING BILLS:\n${billList.join("\n") || "(none)"}`;

  const result = await callStructured<ParsedPayment>({
    system: PARSE_PAYMENT_SYSTEM_PROMPT,
    userText,
    tool: PARSE_PAYMENT_TOOL,
    maxTokens: 400,
  });

  if (result.invoiceId && !invoices.some((i) => i.id === result.invoiceId))
    delete result.invoiceId;
  if (result.billId && !bills.some((b) => b.id === result.billId))
    delete result.billId;
  return result;
}

// ---- AI-suggested starter categories ----

const SUGGEST_CATEGORIES_SYSTEM_PROMPT = `A small business owner has described what their business does. Suggest a short list (5-10) of additional bookkeeping categories that would be useful for THIS specific business, beyond generic defaults like "Bank Account" or "Rent Expense" which they likely already have. Focus on categories specific to their industry/activity.

Rules:
1. Only suggest INCOME or EXPENSE type categories -- not asset/liability/equity accounts.
2. Keep names short and business-like (e.g. "Freelancer Fees", "Shipping & Delivery", "Software Licenses").
3. Don't suggest anything generic that every business already has (bank accounts, share capital, GST payable).

You must respond by calling the emit_category_suggestions tool.`;

const SUGGEST_CATEGORIES_TOOL = {
  name: "emit_category_suggestions",
  description: "Emit suggested bookkeeping categories.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
          },
          required: ["name", "type"],
        },
      },
    },
    required: ["suggestions"],
  },
};

export interface CategorySuggestion {
  name: string;
  type: "INCOME" | "EXPENSE";
}

export async function suggestCategories(
  businessDescription: string,
): Promise<CategorySuggestion[]> {
  const { suggestions } = await callStructured<{
    suggestions: CategorySuggestion[];
  }>({
    system: SUGGEST_CATEGORIES_SYSTEM_PROMPT,
    userText: `Business description: ${businessDescription}`,
    tool: SUGGEST_CATEGORIES_TOOL,
    maxTokens: 512,
  });
  return suggestions;
}
