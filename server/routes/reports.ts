import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { toSgd } from "../lib/convert.js";
import type { Prisma } from "@prisma/client";

async function getRatesMap(): Promise<Record<string, number>> {
  const rates = await prisma.exchangeRate.findMany();
  return Object.fromEntries(rates.map((r) => [r.currency, r.rateToSgd]));
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function buildFilterWhere(
  query: Record<string, unknown>,
): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {};
  if (query.fiscalYear) where.fiscalYear = Number(query.fiscalYear);
  if (query.department) where.department = String(query.department);
  if (query.status) where.status = String(query.status) as never;
  if (query.from || query.to) {
    where.date = {};
    if (query.from)
      (where.date as Prisma.DateTimeFilter).gte = new Date(String(query.from));
    if (query.to)
      (where.date as Prisma.DateTimeFilter).lte = new Date(String(query.to));
  }
  return where;
}

// Dashboard summary. Admin/Finance see company-wide numbers; Managers see
// the same breakdown scoped to their own expenses plus their direct
// reports' — Employees don't get this (their own expense list already
// shows everything relevant to them individually).
reportsRouter.get(
  "/summary",
  requireRole("ADMIN", "MANAGER"),
  async (req, res) => {
    const where = buildFilterWhere(req.query as Record<string, unknown>);
    if (req.user!.role === "MANAGER") {
      where.OR = [
        { submittedById: req.user!.id },
        { submittedBy: { managerId: req.user!.id } },
      ];
    }

    const [rates, expenses] = await Promise.all([
      getRatesMap(),
      prisma.expense.findMany({
        where,
        include: { lineItems: { include: { category: true } } },
        orderBy: { date: "asc" },
      }),
    ]);

    // Every total below is converted to SGD before summing, so expenses in
    // different currencies don't get added together as if they were the
    // same unit -- rates come from Settings > Exchange Rates.
    const byCategory = new Map<string, number>();
    const byDepartment = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byStatus = new Map<string, { total: number; count: number }>();
    const byVendor = new Map<string, { total: number; count: number }>();

    for (const e of expenses) {
      const dept = e.department || "Unassigned";
      const sgdTotal = toSgd(e.amountTotal, e.currency, rates);
      byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + sgdTotal);

      const month = e.date.toISOString().slice(0, 7); // YYYY-MM
      byMonth.set(month, (byMonth.get(month) ?? 0) + sgdTotal);

      const statusEntry = byStatus.get(e.status) ?? { total: 0, count: 0 };
      statusEntry.total += sgdTotal;
      statusEntry.count += 1;
      byStatus.set(e.status, statusEntry);

      const vendorEntry = byVendor.get(e.vendor) ?? { total: 0, count: 0 };
      vendorEntry.total += sgdTotal;
      vendorEntry.count += 1;
      byVendor.set(e.vendor, vendorEntry);

      for (const li of e.lineItems) {
        const name = li.category.name;
        const sgdAmount = toSgd(li.amount, e.currency, rates);
        byCategory.set(name, (byCategory.get(name) ?? 0) + sgdAmount);
      }
    }

    // Flattened line items, ranked by magnitude — powers the "Expense Item
    // Comparison" list, which shows individual logged items rather than
    // category aggregates. Amounts here are SGD-converted for cross-currency
    // comparability; originalAmount/originalCurrency preserve the source figure.
    const items = expenses
      .flatMap((e) =>
        e.lineItems.map((li) => ({
          id: li.id,
          vendor: e.vendor,
          category: li.category.name,
          amount: toSgd(li.amount, e.currency, rates),
          originalAmount: li.amount,
          originalCurrency: e.currency,
          date: e.date.toISOString(),
        })),
      )
      .sort((a, b) => b.amount - a.amount);

    res.json({
      items,
      byStatus: [...byStatus.entries()].map(([status, { total, count }]) => ({
        status,
        total,
        count,
      })),
      byCategory: [...byCategory.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total),
      byDepartment: [...byDepartment.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total),
      byVendor: [...byVendor.entries()]
        .map(([name, { total, count }]) => ({ name, total, count }))
        .sort((a, b) => b.total - a.total),
      byMonth: [...byMonth.entries()]
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      flaggedCount: expenses.filter((e) => e.flagged).length,
      totalAmount: expenses.reduce(
        (s, e) => s + toSgd(e.amountTotal, e.currency, rates),
        0,
      ),
      expenseCount: expenses.length,
      currency: "SGD",
    });
  },
);

reportsRouter.get("/export.csv", requireRole("ADMIN"), async (req, res) => {
  const where = buildFilterWhere(req.query as Record<string, unknown>);
  const [rates, expenses] = await Promise.all([
    getRatesMap(),
    prisma.expense.findMany({
      where,
      include: {
        submittedBy: true,
        lineItems: { include: { category: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const header = [
    "Date",
    "Vendor",
    "Amount",
    "Currency",
    "Amount (SGD)",
    "Status",
    "Department",
    "Submitted By",
    "Fiscal Year",
    "Flagged",
    "Flag Reason",
    "Categories",
  ];
  const csvEscape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = expenses.map((e) =>
    [
      e.date.toISOString().slice(0, 10),
      e.vendor,
      e.amountTotal,
      e.currency,
      toSgd(e.amountTotal, e.currency, rates).toFixed(2),
      e.status,
      e.department ?? "",
      e.submittedBy.name,
      e.fiscalYear,
      e.flagged ? "YES" : "",
      e.flagReason ?? "",
      e.lineItems.map((li) => `${li.category.name}:${li.amount}`).join("; "),
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header.map(csvEscape).join(","), ...rows].join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="expenses-export.csv"`,
  );
  res.send(csv);
});

reportsRouter.get("/export.pdf", requireRole("ADMIN"), async (req, res) => {
  const where = buildFilterWhere(req.query as Record<string, unknown>);
  const [rates, expenses] = await Promise.all([
    getRatesMap(),
    prisma.expense.findMany({
      where,
      include: { submittedBy: true },
      orderBy: { date: "asc" },
    }),
  ]);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="expenses-report.pdf"`,
  );

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  doc.fontSize(18).text("Expense Report", { align: "left" });
  doc.fontSize(10).fillColor("#555").text(new Date().toLocaleString());
  doc.moveDown();

  const total = expenses.reduce(
    (s, e) => s + toSgd(e.amountTotal, e.currency, rates),
    0,
  );
  doc
    .fillColor("#000")
    .fontSize(12)
    .text(
      `Total: SGD ${total.toFixed(2)} across ${expenses.length} expense(s) (converted from original currencies)`,
    );
  doc.moveDown();

  doc.fontSize(9);
  const colX = {
    date: 40,
    vendor: 100,
    amount: 260,
    status: 330,
    submitter: 420,
  };
  doc.font("Helvetica-Bold");
  doc.text("Date", colX.date, doc.y, { continued: false });
  doc.text("Vendor", colX.vendor, doc.y - 11);
  doc.text("Amount", colX.amount, doc.y - 11);
  doc.text("Status", colX.status, doc.y - 11);
  doc.text("Submitted By", colX.submitter, doc.y - 11);
  doc.moveDown(0.5);
  doc.font("Helvetica");

  for (const e of expenses) {
    if (doc.y > 760) doc.addPage();
    const y = doc.y;
    doc.text(e.date.toISOString().slice(0, 10), colX.date, y, { width: 55 });
    doc.text(e.vendor, colX.vendor, y, { width: 155 });
    doc.text(`${e.amountTotal.toFixed(2)} ${e.currency}`, colX.amount, y, {
      width: 65,
    });
    doc.text(e.status, colX.status, y, { width: 85 });
    doc.text(e.submittedBy.name, colX.submitter, y, { width: 120 });
    doc.moveDown(0.6);
  }

  doc.end();
});
