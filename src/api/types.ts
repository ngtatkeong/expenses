export type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";

export type ExpenseStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "INFO_REQUESTED"
  | "PAID";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
  managerId?: string | null;
  active?: boolean;
}

export interface Settings {
  id: number;
  approvalWorkflowEnabled: boolean;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  receiptRequiredAbove: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  spendingLimitPerExpense: number | null;
  active: boolean;
}

export interface ExpenseLineItem {
  id: string;
  categoryId: string;
  amount: number;
  note: string | null;
  category: ExpenseCategory;
}

export interface Receipt {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Expense {
  id: string;
  submittedById: string;
  submittedBy: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  };
  date: string;
  vendor: string;
  amountTotal: number;
  currency: string;
  description: string | null;
  department: string | null;
  status: ExpenseStatus;
  fiscalYear: number;
  currentApproverId: string | null;
  currentApprover: { id: string; name: string } | null;
  flagged: boolean;
  flagReason: string | null;
  locked: boolean;
  createdAt: string;
  lineItems: ExpenseLineItem[];
  receipts: Receipt[];
  auditLogs: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  comment: string | null;
  createdAt: string;
  actor: { name: string; email: string };
}

export interface FiscalYearSummary {
  year: number;
  expenseCount: number;
  totalAmount: number;
  locked: boolean;
  lockedAt: string | null;
}

export interface SpendItem {
  id: string;
  vendor: string;
  category: string;
  amount: number; // converted to SGD
  originalAmount?: number;
  originalCurrency?: string;
  date: string;
}

export interface ReportSummary {
  items: SpendItem[];
  byStatus: { status: ExpenseStatus; total: number; count: number }[];
  byCategory: { name: string; total: number }[];
  byDepartment: { name: string; total: number }[];
  byMonth: { month: string; total: number }[];
  flaggedCount: number;
  totalAmount: number;
  expenseCount: number;
  currency: "SGD";
}

export interface ExchangeRate {
  currency: string;
  rateToSgd: number;
  updatedAt: string;
}
