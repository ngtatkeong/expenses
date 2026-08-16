export function formatMoney(amount: number, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(
    amount,
  );
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-SG");
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INFO_REQUESTED: "Info Requested",
  PAID: "Paid",
};

export const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INFO_REQUESTED: "Info requested",
  INFO_PROVIDED: "Info provided",
  PAID: "Marked paid",
  REOPENED: "Reopened",
  DELETED: "Deleted",
  RECEIPT_ADDED: "Receipt added",
  RECEIPT_REMOVED: "Receipt removed",
};
