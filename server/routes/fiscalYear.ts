import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { writeAudit } from "../lib/audit.js";

export const fiscalYearRouter = Router();
fiscalYearRouter.use(requireAuth);

fiscalYearRouter.get("/", async (_req, res) => {
  const years = await prisma.expense.groupBy({
    by: ["fiscalYear"],
    _count: { _all: true },
    _sum: { amountTotal: true },
    orderBy: { fiscalYear: "desc" },
  });
  const locks = await prisma.fiscalYearLock.findMany();
  const lockMap = new Map(locks.map((l) => [l.year, l]));
  res.json(
    years.map((y) => ({
      year: y.fiscalYear,
      expenseCount: y._count._all,
      totalAmount: y._sum.amountTotal ?? 0,
      locked: lockMap.get(y.fiscalYear)?.locked ?? false,
      lockedAt: lockMap.get(y.fiscalYear)?.lockedAt ?? null,
    })),
  );
});

fiscalYearRouter.post("/:year/lock", requireRole("ADMIN"), async (req, res) => {
  const year = Number(req.params.year);
  const unpaid = await prisma.expense.count({
    where: { fiscalYear: year, status: { notIn: ["PAID", "REJECTED"] } },
  });
  if (unpaid > 0) {
    return res.status(409).json({
      error: `${unpaid} expense(s) in FY${year} are not yet Paid or Rejected — resolve them before locking`,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.fiscalYearLock.upsert({
      where: { year },
      update: { locked: true, lockedById: req.user!.id, lockedAt: new Date() },
      create: {
        year,
        locked: true,
        lockedById: req.user!.id,
        lockedAt: new Date(),
      },
    });
    await tx.expense.updateMany({
      where: { fiscalYear: year },
      data: { locked: true },
    });
    await writeAudit(tx, {
      entityType: "FiscalYearLock",
      entityId: String(year),
      action: "FISCAL_YEAR_LOCKED",
      actorId: req.user!.id,
    });
  });
  res.json({ year, locked: true });
});

fiscalYearRouter.post(
  "/:year/unlock",
  requireRole("ADMIN"),
  async (req, res) => {
    const year = Number(req.params.year);
    await prisma.$transaction(async (tx) => {
      await tx.fiscalYearLock.update({
        where: { year },
        data: { locked: false, lockedById: null, lockedAt: null },
      });
      await tx.expense.updateMany({
        where: { fiscalYear: year },
        data: { locked: false },
      });
      await writeAudit(tx, {
        entityType: "FiscalYearLock",
        entityId: String(year),
        action: "FISCAL_YEAR_UNLOCKED",
        actorId: req.user!.id,
        comment: "Fiscal year re-opened",
      });
    });
    res.json({ year, locked: false });
  },
);
