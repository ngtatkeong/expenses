import { Router } from "express";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { writeAudit } from "../lib/audit.js";
import { computeFiscalYear } from "../lib/fiscalYear.js";
import { recomputeExpenseFlags } from "../lib/policy-recompute.js";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

const expenseInclude = {
  submittedBy: {
    select: { id: true, name: true, email: true, department: true },
  },
  currentApprover: { select: { id: true, name: true, email: true } },
  lineItems: { include: { category: true } },
  receipts: true,
  auditLogs: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

function visibilityWhere(
  user: NonNullable<Express.Request["user"]>,
): Prisma.ExpenseWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "MANAGER") {
    return {
      OR: [
        { submittedById: user.id },
        { currentApproverId: user.id },
        { currentApproverId: null, status: "PENDING_APPROVAL" },
        { submittedBy: { managerId: user.id } },
      ],
    };
  }
  return { submittedById: user.id };
}

async function canView(
  user: NonNullable<Express.Request["user"]>,
  expense: {
    submittedById: string;
    currentApproverId: string | null;
    status: string;
    submitterManagerId?: string | null;
  },
) {
  if (user.role === "ADMIN") return true;
  if (expense.submittedById === user.id) return true;
  if (user.role === "MANAGER") {
    if (expense.currentApproverId === user.id) return true;
    if (
      expense.currentApproverId === null &&
      expense.status === "PENDING_APPROVAL"
    )
      return true;
    if (expense.submitterManagerId === user.id) return true;
  }
  return false;
}

interface LineItemInput {
  categoryId: string;
  amount: number;
  note?: string;
}

async function replaceLineItems(
  tx: Prisma.TransactionClient,
  expenseId: string,
  items: LineItemInput[],
) {
  if (!items?.length)
    throw new Error("At least one category line item is required");
  const categories = await tx.expenseCategory.findMany({
    where: { id: { in: items.map((i) => i.categoryId) } },
  });
  if (categories.length !== new Set(items.map((i) => i.categoryId)).size) {
    throw new Error("One or more categories do not exist");
  }
  await tx.expenseLineItem.deleteMany({ where: { expenseId } });
  await tx.expenseLineItem.createMany({
    data: items.map((i) => ({
      expenseId,
      categoryId: i.categoryId,
      amount: Number(i.amount),
      note: i.note || null,
    })),
  });
  return items.reduce((sum, i) => sum + Number(i.amount), 0);
}

// GET /api/expenses — list, filterable
expensesRouter.get("/", async (req, res) => {
  const { status, fiscalYear, department, submittedById } = req.query;
  const where: Prisma.ExpenseWhereInput = { AND: [visibilityWhere(req.user!)] };
  const and = where.AND as Prisma.ExpenseWhereInput[];
  if (status) and.push({ status: String(status) as never });
  if (fiscalYear) and.push({ fiscalYear: Number(fiscalYear) });
  if (department) and.push({ department: String(department) });
  if (submittedById) and.push({ submittedById: String(submittedById) });

  const expenses = await prisma.expense.findMany({
    where,
    include: expenseInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(expenses);
});

expensesRouter.get("/:id", async (req, res) => {
  const expense = await prisma.expense.findUnique({
    where: { id: req.params.id as string },
    include: {
      ...expenseInclude,
      submittedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          managerId: true,
        },
      },
    },
  });
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  const allowed = await canView(req.user!, {
    ...expense,
    submitterManagerId: expense.submittedBy.managerId,
  });
  if (!allowed)
    return res
      .status(403)
      .json({ error: "Not permitted to view this expense" });
  res.json(expense);
});

// POST /api/expenses — create a DRAFT or submit immediately (submit: true)
expensesRouter.post("/", async (req, res) => {
  const { date, vendor, currency, description, department, lineItems, submit } =
    req.body ?? {};
  if (!date || !vendor || !lineItems?.length) {
    return res
      .status(400)
      .json({ error: "date, vendor, and at least one line item are required" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.settings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      });
      const expenseDate = new Date(date);
      const fiscalYear = computeFiscalYear(
        expenseDate,
        settings.fiscalYearStartMonth,
      );

      const existingLock = await tx.fiscalYearLock.findUnique({
        where: { year: fiscalYear },
      });
      if (existingLock?.locked) {
        throw new Error(
          `Fiscal year ${fiscalYear} is locked — cannot log expenses against it`,
        );
      }

      const amountTotal = (lineItems as LineItemInput[]).reduce(
        (s, i) => s + Number(i.amount),
        0,
      );

      const expense = await tx.expense.create({
        data: {
          submittedById: req.user!.id,
          date: expenseDate,
          vendor,
          amountTotal,
          currency: currency || settings.defaultCurrency,
          description: description || null,
          department: department || req.user!.department,
          fiscalYear,
          status: "DRAFT",
        },
      });
      await replaceLineItems(tx, expense.id, lineItems);
      await writeAudit(tx, {
        entityType: "Expense",
        entityId: expense.id,
        action: "CREATED",
        actorId: req.user!.id,
        after: expense,
        expenseId: expense.id,
      });

      if (submit) {
        await submitExpenseTx(tx, expense.id, req.user!.id);
      } else {
        await recomputeExpenseFlags(expense.id, tx);
      }

      return tx.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: expenseInclude,
      });
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to create expense",
    });
  }
});

// PATCH /api/expenses/:id — edit a DRAFT or INFO_REQUESTED expense (submitter only), optionally submit
expensesRouter.patch("/:id", async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  if (existing.submittedById !== req.user!.id && req.user!.role !== "ADMIN") {
    return res
      .status(403)
      .json({ error: "Only the submitter can edit this expense" });
  }
  if (existing.locked)
    return res
      .status(409)
      .json({ error: "This expense's fiscal year is locked" });
  if (!["DRAFT", "INFO_REQUESTED"].includes(existing.status)) {
    return res
      .status(409)
      .json({ error: `Cannot edit an expense with status ${existing.status}` });
  }

  const { date, vendor, currency, description, department, lineItems, submit } =
    req.body ?? {};

  try {
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.settings.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      });
      const data: Prisma.ExpenseUpdateInput = {};
      if (vendor !== undefined) data.vendor = vendor;
      if (currency !== undefined) data.currency = currency;
      if (description !== undefined) data.description = description || null;
      if (department !== undefined) data.department = department || null;
      if (date !== undefined) {
        const expenseDate = new Date(date);
        data.date = expenseDate;
        data.fiscalYear = computeFiscalYear(
          expenseDate,
          settings.fiscalYearStartMonth,
        );
      }
      if (lineItems !== undefined) {
        data.amountTotal = await replaceLineItems(tx, id, lineItems);
      }
      const wasInfoRequested = existing.status === "INFO_REQUESTED";
      if (Object.keys(data).length > 0) {
        await tx.expense.update({ where: { id }, data });
        await writeAudit(tx, {
          entityType: "Expense",
          entityId: id,
          action: "UPDATED",
          actorId: req.user!.id,
          before: existing,
          after: data,
          expenseId: id,
        });
      }
      if (submit || wasInfoRequested) {
        if (wasInfoRequested) {
          await writeAudit(tx, {
            entityType: "Expense",
            entityId: id,
            action: "INFO_PROVIDED",
            actorId: req.user!.id,
            expenseId: id,
          });
        }
        await submitExpenseTx(tx, id, req.user!.id);
      } else {
        await recomputeExpenseFlags(id, tx);
      }
      return tx.expense.findUniqueOrThrow({
        where: { id },
        include: expenseInclude,
      });
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to update expense",
    });
  }
});

// Admins may recategorize a line item on any unlocked expense, regardless of
// status (including PAID) — this only changes reporting classification, not
// the amount, so it's a lower-risk correction than a full edit. Everyone else
// stays restricted to editing via PATCH /:id, which only allows DRAFT/
// INFO_REQUESTED expenses.
expensesRouter.patch(
  "/:id/line-items/:lineItemId/category",
  async (req, res) => {
    if (req.user!.role !== "ADMIN") {
      return res
        .status(403)
        .json({
          error: "Only an admin can recategorize a line item after submission",
        });
    }
    const id = req.params.id as string;
    const lineItemId = req.params.lineItemId as string;
    const { categoryId } = req.body ?? {};
    if (!categoryId) {
      return res.status(400).json({ error: "categoryId is required" });
    }

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Expense not found" });
    if (existing.locked) {
      return res
        .status(409)
        .json({ error: "This expense's fiscal year is locked" });
    }

    const lineItem = await prisma.expenseLineItem.findUnique({
      where: { id: lineItemId },
      include: { category: true },
    });
    if (!lineItem || lineItem.expenseId !== id) {
      return res.status(404).json({ error: "Line item not found" });
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) return res.status(400).json({ error: "Category not found" });

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.expenseLineItem.update({
          where: { id: lineItemId },
          data: { categoryId },
        });
        await writeAudit(tx, {
          entityType: "Expense",
          entityId: id,
          action: "UPDATED",
          actorId: req.user!.id,
          before: { lineItemId, category: lineItem.category.name },
          after: { lineItemId, category: category.name },
          comment: "Recategorized line item (admin correction)",
          expenseId: id,
        });
        await recomputeExpenseFlags(id, tx);
        return tx.expense.findUniqueOrThrow({
          where: { id },
          include: expenseInclude,
        });
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to recategorize line item",
      });
    }
  },
);

expensesRouter.delete("/:id", async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  if (existing.submittedById !== req.user!.id && req.user!.role !== "ADMIN") {
    return res
      .status(403)
      .json({ error: "Only the submitter can delete this expense" });
  }
  if (existing.status !== "DRAFT") {
    return res
      .status(409)
      .json({ error: "Only draft expenses can be deleted" });
  }
  await writeAudit(prisma, {
    entityType: "Expense",
    entityId: id,
    action: "DELETED",
    actorId: req.user!.id,
    before: existing,
  });
  await prisma.expense.delete({ where: { id } });
  res.json({ ok: true });
});

// Shared submit logic — routes to a manager, or straight to APPROVED if the
// approval workflow is switched off in Settings.
async function submitExpenseTx(
  tx: Prisma.TransactionClient,
  expenseId: string,
  actorId: string,
) {
  const settings = await tx.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const expense = await tx.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { submittedBy: true },
  });

  if (settings.approvalWorkflowEnabled) {
    await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: "PENDING_APPROVAL",
        currentApproverId: expense.submittedBy.managerId ?? null,
      },
    });
    await writeAudit(tx, {
      entityType: "Expense",
      entityId: expenseId,
      action: "SUBMITTED",
      actorId,
      expenseId,
      comment: expense.submittedBy.managerId
        ? undefined
        : "No manager assigned to submitter — routed to the unassigned manager queue",
    });
  } else {
    await tx.expense.update({
      where: { id: expenseId },
      data: { status: "APPROVED", currentApproverId: null },
    });
    await writeAudit(tx, {
      entityType: "Expense",
      entityId: expenseId,
      action: "SUBMITTED",
      actorId,
      expenseId,
      comment: "Approval workflow is disabled — routed directly to Approved",
    });
  }
  await recomputeExpenseFlags(expenseId, tx);
}

async function requireApproverAccess(req: Request, expenseId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { submittedBy: { select: { managerId: true } } },
  });
  if (!expense)
    return { ok: false as const, code: 404, error: "Expense not found" };
  if (expense.status !== "PENDING_APPROVAL") {
    return {
      ok: false as const,
      code: 409,
      error: `Expense is not pending approval (status: ${expense.status})`,
    };
  }
  const user = req.user!;
  const permitted =
    user.role === "ADMIN" ||
    expense.currentApproverId === user.id ||
    (expense.currentApproverId === null && user.role === "MANAGER");
  if (!permitted)
    return {
      ok: false as const,
      code: 403,
      error: "Not permitted to act on this expense",
    };
  return { ok: true as const, expense };
}

expensesRouter.post("/:id/approve", async (req, res) => {
  const check = await requireApproverAccess(req, req.params.id as string);
  if (!check.ok) return res.status(check.code).json({ error: check.error });

  const updated = await prisma.$transaction(async (tx) => {
    const e = await tx.expense.update({
      where: { id: req.params.id as string },
      data: { status: "APPROVED", currentApproverId: null },
    });
    await writeAudit(tx, {
      entityType: "Expense",
      entityId: e.id,
      action: "APPROVED",
      actorId: req.user!.id,
      comment: req.body?.comment,
      expenseId: e.id,
    });
    return tx.expense.findUniqueOrThrow({
      where: { id: e.id },
      include: expenseInclude,
    });
  });
  res.json(updated);
});

expensesRouter.post("/:id/reject", async (req, res) => {
  const check = await requireApproverAccess(req, req.params.id as string);
  if (!check.ok) return res.status(check.code).json({ error: check.error });
  if (!req.body?.comment)
    return res
      .status(400)
      .json({ error: "A reason is required to reject an expense" });

  const updated = await prisma.$transaction(async (tx) => {
    const e = await tx.expense.update({
      where: { id: req.params.id as string },
      data: { status: "REJECTED", currentApproverId: null },
    });
    await writeAudit(tx, {
      entityType: "Expense",
      entityId: e.id,
      action: "REJECTED",
      actorId: req.user!.id,
      comment: req.body.comment,
      expenseId: e.id,
    });
    return tx.expense.findUniqueOrThrow({
      where: { id: e.id },
      include: expenseInclude,
    });
  });
  res.json(updated);
});

expensesRouter.post("/:id/request-info", async (req, res) => {
  const check = await requireApproverAccess(req, req.params.id as string);
  if (!check.ok) return res.status(check.code).json({ error: check.error });
  if (!req.body?.comment)
    return res
      .status(400)
      .json({ error: "Describe what information is needed" });

  const updated = await prisma.$transaction(async (tx) => {
    const e = await tx.expense.update({
      where: { id: req.params.id as string },
      data: { status: "INFO_REQUESTED" },
    });
    await writeAudit(tx, {
      entityType: "Expense",
      entityId: e.id,
      action: "INFO_REQUESTED",
      actorId: req.user!.id,
      comment: req.body.comment,
      expenseId: e.id,
    });
    return tx.expense.findUniqueOrThrow({
      where: { id: e.id },
      include: expenseInclude,
    });
  });
  res.json(updated);
});

expensesRouter.post("/:id/pay", async (req, res) => {
  if (!["ADMIN"].includes(req.user!.role)) {
    return res
      .status(403)
      .json({ error: "Only Finance/Admin can mark an expense as paid" });
  }
  const expense = await prisma.expense.findUnique({
    where: { id: req.params.id as string },
  });
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  if (expense.status !== "APPROVED") {
    return res.status(409).json({
      error: `Only approved expenses can be paid (status: ${expense.status})`,
    });
  }
  if (expense.locked)
    return res
      .status(409)
      .json({ error: "This expense's fiscal year is locked" });

  const updated = await prisma.$transaction(async (tx) => {
    const e = await tx.expense.update({
      where: { id: req.params.id as string },
      data: { status: "PAID" },
    });
    await writeAudit(tx, {
      entityType: "Expense",
      entityId: e.id,
      action: "PAID",
      actorId: req.user!.id,
      comment: req.body?.comment,
      expenseId: e.id,
    });
    return tx.expense.findUniqueOrThrow({
      where: { id: e.id },
      include: expenseInclude,
    });
  });
  res.json(updated);
});

expensesRouter.get("/:id/audit-log", async (req, res) => {
  const expense = await prisma.expense.findUnique({
    where: { id: req.params.id as string },
    include: { submittedBy: { select: { managerId: true } } },
  });
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  const allowed = await canView(req.user!, {
    ...expense,
    submitterManagerId: expense.submittedBy.managerId,
  });
  if (!allowed) return res.status(403).json({ error: "Not permitted" });

  const logs = await prisma.auditLog.findMany({
    where: { expenseId: expense.id },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(logs);
});
