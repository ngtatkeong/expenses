export type AccountType =
  "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  active: boolean;
}

export interface JournalLine {
  id: string;
  accountId: string;
  account?: Account;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string | null;
  reference: string | null;
  source: "MANUAL" | "INVOICE" | "BILL" | "PAYMENT";
  lines: JournalLine[];
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  active: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  active: boolean;
}

export interface DocLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer: Customer;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
  notes: string | null;
  lines: DocLine[];
  total: number;
  paid: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  vendorId: string;
  vendor: Vendor;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: "DRAFT" | "RECEIVED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
  notes: string | null;
  lines: DocLine[];
  total: number;
  paid: number;
}

export interface Payment {
  id: string;
  type: "RECEIVED" | "PAID";
  date: string;
  amount: number;
  method: string | null;
  invoiceId: string | null;
  billId: string | null;
  bankAccountId: string;
  bankAccount?: Account;
  invoice?: Invoice | null;
  bill?: Bill | null;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface ProfitAndLoss {
  income: (TrialBalanceRow & { amount: number })[];
  expense: (TrialBalanceRow & { amount: number })[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}

export interface BalanceSheet {
  assets: (TrialBalanceRow & { amount: number })[];
  liabilities: (TrialBalanceRow & { amount: number })[];
  equity: (TrialBalanceRow & { amount: number })[];
  currentYearEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balances: boolean;
}
