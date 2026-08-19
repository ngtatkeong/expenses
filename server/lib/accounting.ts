import { accountingDb } from "../accountingDb.js";
import type { Prisma } from "../generated/accounting-client/index.js";

// Default starter chart of accounts for a small Singapore company. Codes
// follow a conventional 1000s-per-type numbering band so custom accounts
// added later can be slotted in without renumbering everything.
export const DEFAULT_CHART_OF_ACCOUNTS: {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
}[] = [
  { code: "1000", name: "Cash on Hand", type: "ASSET" },
  { code: "1010", name: "Bank Account", type: "ASSET" },
  { code: "1200", name: "Accounts Receivable", type: "ASSET" },
  { code: "1500", name: "Office Equipment", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "GST Payable", type: "LIABILITY" },
  { code: "2200", name: "Accrued Liabilities", type: "LIABILITY" },
  { code: "3000", name: "Share Capital", type: "EQUITY" },
  { code: "3900", name: "Retained Earnings", type: "EQUITY" },
  { code: "4000", name: "Sales Revenue", type: "INCOME" },
  { code: "4900", name: "Other Income", type: "INCOME" },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: "6000", name: "Rent Expense", type: "EXPENSE" },
  { code: "6100", name: "Salaries & CPF Expense", type: "EXPENSE" },
  { code: "6200", name: "Office Supplies", type: "EXPENSE" },
  { code: "6300", name: "Professional Fees", type: "EXPENSE" },
  { code: "6400", name: "Utilities", type: "EXPENSE" },
  { code: "6900", name: "Other Expenses", type: "EXPENSE" },
];

export async function seedChartOfAccountsIfEmpty() {
  const count = await accountingDb.account.count();
  if (count > 0) return { seeded: false };
  await accountingDb.account.createMany({ data: DEFAULT_CHART_OF_ACCOUNTS });
  return { seeded: true };
}

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export class UnbalancedJournalError extends Error {
  constructor(totalDebit: number, totalCredit: number) {
    super(
      `Journal entry is not balanced: total debits ${totalDebit.toFixed(2)} != total credits ${totalCredit.toFixed(2)}`,
    );
    this.name = "UnbalancedJournalError";
  }
}

// Rounds to 2dp the way currency math should be compared -- avoids float
// noise (e.g. 10.1 + 20.2) causing a false "unbalanced" rejection.
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function assertBalanced(lines: JournalLineInput[]) {
  const totalDebit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (totalDebit !== totalCredit) {
    throw new UnbalancedJournalError(totalDebit, totalCredit);
  }
  if (totalDebit === 0) {
    throw new Error("Journal entry has no amount");
  }
}

export async function postJournalEntry(
  tx: Prisma.TransactionClient,
  params: {
    date: Date;
    memo?: string;
    reference?: string;
    source?: "MANUAL" | "INVOICE" | "BILL" | "PAYMENT";
    createdById: string;
    lines: JournalLineInput[];
  },
) {
  assertBalanced(params.lines);
  return tx.journalEntry.create({
    data: {
      date: params.date,
      memo: params.memo,
      reference: params.reference,
      source: params.source ?? "MANUAL",
      createdById: params.createdById,
      lines: {
        create: params.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          description: l.description,
        })),
      },
    },
    include: { lines: true },
  });
}

export function decToNum(d: Prisma.Decimal | number | null | undefined) {
  if (d === null || d === undefined) return 0;
  return typeof d === "number" ? d : Number(d);
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}

export async function computeTrialBalance(opts?: {
  from?: Date;
  to?: Date;
}): Promise<TrialBalanceRow[]> {
  const accounts = await accountingDb.account.findMany({
    orderBy: { code: "asc" },
  });
  const dateFilter: Prisma.JournalEntryWhereInput = {};
  if (opts?.from || opts?.to) {
    dateFilter.date = {};
    if (opts.from) (dateFilter.date as Prisma.DateTimeFilter).gte = opts.from;
    if (opts.to) (dateFilter.date as Prisma.DateTimeFilter).lte = opts.to;
  }
  const lines = await accountingDb.journalLine.findMany({
    where: { journalEntry: dateFilter },
  });
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = totals.get(l.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += decToNum(l.debit);
    cur.credit += decToNum(l.credit);
    totals.set(l.accountId, cur);
  }
  return accounts.map((a) => {
    const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: round2(t.debit),
      credit: round2(t.credit),
    };
  });
}

// A trial balance row's "net" reads as a debit balance for ASSET/EXPENSE
// accounts and a credit balance for LIABILITY/EQUITY/INCOME accounts --
// this normalizes each row to a single signed number in its natural
// direction so P&L/Balance Sheet totals add up the way a reader expects.
function naturalBalance(type: string, debit: number, credit: number) {
  const isDebitNormal = type === "ASSET" || type === "EXPENSE";
  return isDebitNormal ? round2(debit - credit) : round2(credit - debit);
}

export async function computeProfitAndLoss(opts?: { from?: Date; to?: Date }) {
  const rows = await computeTrialBalance(opts);
  const income = rows
    .filter((r) => r.type === "INCOME")
    .map((r) => ({ ...r, amount: naturalBalance(r.type, r.debit, r.credit) }));
  const expense = rows
    .filter((r) => r.type === "EXPENSE")
    .map((r) => ({ ...r, amount: naturalBalance(r.type, r.debit, r.credit) }));
  const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
  const totalExpense = round2(expense.reduce((s, r) => s + r.amount, 0));
  return {
    income,
    expense,
    totalIncome,
    totalExpense,
    netProfit: round2(totalIncome - totalExpense),
  };
}

export async function computeBalanceSheet(asOf?: Date) {
  const rows = await computeTrialBalance(asOf ? { to: asOf } : undefined);
  const pnl = await computeProfitAndLoss(asOf ? { to: asOf } : undefined);
  const assets = rows
    .filter((r) => r.type === "ASSET")
    .map((r) => ({ ...r, amount: naturalBalance(r.type, r.debit, r.credit) }));
  const liabilities = rows
    .filter((r) => r.type === "LIABILITY")
    .map((r) => ({ ...r, amount: naturalBalance(r.type, r.debit, r.credit) }));
  const equity = rows
    .filter((r) => r.type === "EQUITY")
    .map((r) => ({ ...r, amount: naturalBalance(r.type, r.debit, r.credit) }));
  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(
    liabilities.reduce((s, r) => s + r.amount, 0),
  );
  const totalEquityRaw = round2(equity.reduce((s, r) => s + r.amount, 0));
  // Current-year P&L hasn't been closed into Retained Earnings yet (no
  // period-close step in this simple system), so it's folded in here as a
  // synthetic "Current Year Earnings" line for the balance sheet to
  // actually balance against the trial balance's asset/liability totals.
  const totalEquity = round2(totalEquityRaw + pnl.netProfit);
  return {
    assets,
    liabilities,
    equity,
    currentYearEarnings: pnl.netProfit,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balances: totalAssets === round2(totalLiabilities + totalEquity),
  };
}
