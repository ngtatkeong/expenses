import { prisma } from "../db.js";
import type { AuditAction, Prisma } from "@prisma/client";

interface WriteAuditParams {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  before?: unknown;
  after?: unknown;
  comment?: string;
  expenseId?: string;
}

// The only way an AuditLog row is ever created — no route updates or
// deletes these rows (also enforced by a DB trigger, see the
// audit_log_immutable migration).
export async function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  params: WriteAuditParams,
) {
  await tx.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId,
      before:
        params.before !== undefined ? JSON.stringify(params.before) : null,
      after: params.after !== undefined ? JSON.stringify(params.after) : null,
      comment: params.comment,
      expenseId: params.expenseId,
    },
  });
}
