import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { writeAudit } from "../lib/audit.js";

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get("/", async (req, res) => {
  const includeInactive =
    req.query.all === "1" && req.user!.role !== "EMPLOYEE";
  const categories = await prisma.expenseCategory.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  res.json(categories);
});

categoriesRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const { name, description, spendingLimitPerExpense } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const category = await prisma.expenseCategory.create({
    data: {
      name,
      description: description || null,
      spendingLimitPerExpense:
        spendingLimitPerExpense != null
          ? Number(spendingLimitPerExpense)
          : null,
    },
  });
  await writeAudit(prisma, {
    entityType: "ExpenseCategory",
    entityId: category.id,
    action: "CATEGORY_CREATED",
    actorId: req.user!.id,
    after: category,
  });
  res.status(201).json(category);
});

categoriesRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const before = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Category not found" });

  const { name, description, spendingLimitPerExpense, active } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description || null;
  if (spendingLimitPerExpense !== undefined) {
    data.spendingLimitPerExpense =
      spendingLimitPerExpense != null ? Number(spendingLimitPerExpense) : null;
  }
  if (active !== undefined) data.active = active;

  const category = await prisma.expenseCategory.update({ where: { id }, data });
  await writeAudit(prisma, {
    entityType: "ExpenseCategory",
    entityId: category.id,
    action: active === false ? "CATEGORY_DELETED" : "CATEGORY_UPDATED",
    actorId: req.user!.id,
    before,
    after: category,
  });
  res.json(category);
});
