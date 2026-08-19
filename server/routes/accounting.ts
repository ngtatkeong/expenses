import { Router } from "express";
import PDFDocument from "pdfkit";
import { requireAuth, requireRole } from "../auth.js";
import { accountingDb } from "../accountingDb.js";
import {
  seedChartOfAccountsIfEmpty,
  postJournalEntry,
  computeTrialBalance,
  computeProfitAndLoss,
  computeBalanceSheet,
  decToNum,
  UnbalancedJournalError,
  type JournalLineInput,
} from "../lib/accounting.js";

export const accountingRouter = Router();
accountingRouter.use(requireAuth, requireRole("ADMIN"));

function parseDateRange(query: Record<string, unknown>) {
  return {
    from: query.from ? new Date(String(query.from)) : undefined,
    to: query.to ? new Date(String(query.to)) : undefined,
  };
}

function serializeAccount(a: {
  debit?: unknown;
  credit?: unknown;
  [k: string]: unknown;
}) {
  return a;
}

function serializeMoneyFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) out[f as string] = decToNum(obj[f] as never);
  return out as T;
}

// ---- Setup ----

accountingRouter.post("/setup/seed", async (_req, res) => {
  const result = await seedChartOfAccountsIfEmpty();
  res.json(result);
});

// ---- Chart of Accounts ----

accountingRouter.get("/accounts", async (_req, res) => {
  const accounts = await accountingDb.account.findMany({
    orderBy: { code: "asc" },
  });
  res.json(accounts.map(serializeAccount));
});

accountingRouter.post("/accounts", async (req, res) => {
  const { code, name, type, description } = req.body;
  if (!code || !name || !type) {
    return res.status(400).json({ error: "code, name, and type are required" });
  }
  const account = await accountingDb.account.create({
    data: { code, name, type, description },
  });
  res.status(201).json(account);
});

accountingRouter.patch("/accounts/:id", async (req, res) => {
  const { name, description, active } = req.body;
  const account = await accountingDb.account.update({
    where: { id: req.params.id },
    data: { name, description, active },
  });
  res.json(account);
});

// ---- Manual Journal Entries ----

accountingRouter.get("/journal-entries", async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = from;
    if (to) (where.date as Record<string, unknown>).lte = to;
  }
  const entries = await accountingDb.journalEntry.findMany({
    where,
    include: { lines: { include: { account: true } } },
    orderBy: { date: "desc" },
  });
  res.json(
    entries.map((e) => ({
      ...e,
      lines: e.lines.map((l) => serializeMoneyFields(l, ["debit", "credit"])),
    })),
  );
});

accountingRouter.post("/journal-entries", async (req, res) => {
  const { date, memo, reference, lines } = req.body as {
    date: string;
    memo?: string;
    reference?: string;
    lines: JournalLineInput[];
  };
  if (!date || !Array.isArray(lines) || lines.length < 2) {
    return res
      .status(400)
      .json({ error: "date and at least two journal lines are required" });
  }
  try {
    const entry = await accountingDb.$transaction((tx) =>
      postJournalEntry(tx, {
        date: new Date(date),
        memo,
        reference,
        source: "MANUAL",
        createdById: req.user!.id,
        lines,
      }),
    );
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof UnbalancedJournalError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

accountingRouter.delete("/journal-entries/:id", async (req, res) => {
  const entry = await accountingDb.journalEntry.findUnique({
    where: { id: req.params.id },
  });
  if (!entry) return res.status(404).json({ error: "Not found" });
  if (entry.source !== "MANUAL") {
    return res.status(400).json({
      error:
        "This entry was posted automatically from an invoice/bill/payment — void that record instead of deleting the entry directly",
    });
  }
  await accountingDb.journalEntry.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ---- Customers & Vendors ----

accountingRouter.get("/customers", async (_req, res) => {
  res.json(await accountingDb.customer.findMany({ orderBy: { name: "asc" } }));
});

accountingRouter.post("/customers", async (req, res) => {
  const { name, email, address } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  res
    .status(201)
    .json(
      await accountingDb.customer.create({ data: { name, email, address } }),
    );
});

accountingRouter.get("/vendors", async (_req, res) => {
  res.json(await accountingDb.vendor.findMany({ orderBy: { name: "asc" } }));
});

accountingRouter.post("/vendors", async (req, res) => {
  const { name, email, address } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  res
    .status(201)
    .json(await accountingDb.vendor.create({ data: { name, email, address } }));
});

// ---- Invoices (sales) ----

interface DocLineInput {
  description: string;
  quantity?: number;
  unitPrice: number;
  accountId: string;
}

function lineTotal(l: DocLineInput) {
  return Math.round((l.quantity ?? 1) * l.unitPrice * 100) / 100;
}

accountingRouter.get("/invoices", async (_req, res) => {
  const invoices = await accountingDb.invoice.findMany({
    include: { customer: true, lines: true, payments: true },
    orderBy: { issueDate: "desc" },
  });
  res.json(
    invoices.map((inv) => ({
      ...inv,
      lines: inv.lines.map((l) =>
        serializeMoneyFields(l, ["quantity", "unitPrice"]),
      ),
      payments: inv.payments.map((p) => serializeMoneyFields(p, ["amount"])),
      total: round2(
        inv.lines.reduce(
          (s, l) =>
            s +
            lineTotal({
              description: l.description,
              quantity: decToNum(l.quantity),
              unitPrice: decToNum(l.unitPrice),
              accountId: l.accountId,
            }),
          0,
        ),
      ),
      paid: round2(inv.payments.reduce((s, p) => s + decToNum(p.amount), 0)),
    })),
  );
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

accountingRouter.post("/invoices", async (req, res) => {
  const {
    invoiceNumber,
    customerId,
    issueDate,
    dueDate,
    currency,
    notes,
    lines,
    receivableAccountId,
  } = req.body as {
    invoiceNumber: string;
    customerId: string;
    issueDate: string;
    dueDate: string;
    currency?: string;
    notes?: string;
    lines: DocLineInput[];
    receivableAccountId: string;
  };
  if (
    !invoiceNumber ||
    !customerId ||
    !issueDate ||
    !dueDate ||
    !lines?.length ||
    !receivableAccountId
  ) {
    return res.status(400).json({
      error:
        "invoiceNumber, customerId, issueDate, dueDate, receivableAccountId and at least one line are required",
    });
  }
  const total = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  try {
    const invoice = await accountingDb.$transaction(async (tx) => {
      const journalEntry = await postJournalEntry(tx, {
        date: new Date(issueDate),
        memo: `Invoice ${invoiceNumber}`,
        reference: invoiceNumber,
        source: "INVOICE",
        createdById: req.user!.id,
        lines: [
          { accountId: receivableAccountId, debit: total },
          ...lines.map((l) => ({
            accountId: l.accountId,
            credit: lineTotal(l),
            description: l.description,
          })),
        ],
      });
      return tx.invoice.create({
        data: {
          invoiceNumber,
          customerId,
          issueDate: new Date(issueDate),
          dueDate: new Date(dueDate),
          currency: currency || "SGD",
          notes,
          status: "SENT",
          createdById: req.user!.id,
          journalEntryId: journalEntry.id,
          lines: {
            create: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity ?? 1,
              unitPrice: l.unitPrice,
              accountId: l.accountId,
            })),
          },
        },
        include: { lines: true, customer: true },
      });
    });
    res.status(201).json(invoice);
  } catch (err) {
    if (err instanceof UnbalancedJournalError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

accountingRouter.post("/invoices/:id/void", async (req, res) => {
  const invoice = await accountingDb.invoice.update({
    where: { id: req.params.id },
    data: { status: "VOID" },
  });
  res.json(invoice);
});

// ---- Bills (purchases) ----

accountingRouter.get("/bills", async (_req, res) => {
  const bills = await accountingDb.bill.findMany({
    include: { vendor: true, lines: true, payments: true },
    orderBy: { issueDate: "desc" },
  });
  res.json(
    bills.map((b) => ({
      ...b,
      lines: b.lines.map((l) =>
        serializeMoneyFields(l, ["quantity", "unitPrice"]),
      ),
      payments: b.payments.map((p) => serializeMoneyFields(p, ["amount"])),
      total: round2(
        b.lines.reduce(
          (s, l) =>
            s +
            lineTotal({
              description: l.description,
              quantity: decToNum(l.quantity),
              unitPrice: decToNum(l.unitPrice),
              accountId: l.accountId,
            }),
          0,
        ),
      ),
      paid: round2(b.payments.reduce((s, p) => s + decToNum(p.amount), 0)),
    })),
  );
});

accountingRouter.post("/bills", async (req, res) => {
  const {
    billNumber,
    vendorId,
    issueDate,
    dueDate,
    currency,
    notes,
    lines,
    payableAccountId,
  } = req.body as {
    billNumber: string;
    vendorId: string;
    issueDate: string;
    dueDate: string;
    currency?: string;
    notes?: string;
    lines: DocLineInput[];
    payableAccountId: string;
  };
  if (
    !billNumber ||
    !vendorId ||
    !issueDate ||
    !dueDate ||
    !lines?.length ||
    !payableAccountId
  ) {
    return res.status(400).json({
      error:
        "billNumber, vendorId, issueDate, dueDate, payableAccountId and at least one line are required",
    });
  }
  const total = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  try {
    const bill = await accountingDb.$transaction(async (tx) => {
      const journalEntry = await postJournalEntry(tx, {
        date: new Date(issueDate),
        memo: `Bill ${billNumber}`,
        reference: billNumber,
        source: "BILL",
        createdById: req.user!.id,
        lines: [
          ...lines.map((l) => ({
            accountId: l.accountId,
            debit: lineTotal(l),
            description: l.description,
          })),
          { accountId: payableAccountId, credit: total },
        ],
      });
      return tx.bill.create({
        data: {
          billNumber,
          vendorId,
          issueDate: new Date(issueDate),
          dueDate: new Date(dueDate),
          currency: currency || "SGD",
          notes,
          status: "RECEIVED",
          createdById: req.user!.id,
          journalEntryId: journalEntry.id,
          lines: {
            create: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity ?? 1,
              unitPrice: l.unitPrice,
              accountId: l.accountId,
            })),
          },
        },
        include: { lines: true, vendor: true },
      });
    });
    res.status(201).json(bill);
  } catch (err) {
    if (err instanceof UnbalancedJournalError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

accountingRouter.post("/bills/:id/void", async (req, res) => {
  const bill = await accountingDb.bill.update({
    where: { id: req.params.id },
    data: { status: "VOID" },
  });
  res.json(bill);
});

// ---- Payments ----

accountingRouter.get("/payments", async (_req, res) => {
  const payments = await accountingDb.payment.findMany({
    include: { invoice: true, bill: true, bankAccount: true },
    orderBy: { date: "desc" },
  });
  res.json(payments.map((p) => serializeMoneyFields(p, ["amount"])));
});

accountingRouter.post("/payments", async (req, res) => {
  const { type, date, amount, method, invoiceId, billId, bankAccountId } =
    req.body as {
      type: "RECEIVED" | "PAID";
      date: string;
      amount: number;
      method?: string;
      invoiceId?: string;
      billId?: string;
      bankAccountId: string;
    };
  if (!type || !date || !amount || !bankAccountId || (!invoiceId && !billId)) {
    return res.status(400).json({
      error:
        "type, date, amount, bankAccountId and one of invoiceId/billId are required",
    });
  }
  try {
    const payment = await accountingDb.$transaction(async (tx) => {
      let counterpartAccountId: string;
      if (type === "RECEIVED") {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          include: { lines: true },
        });
        // Receivable is always the account debited on the original invoice
        // journal entry -- re-derive it from that entry's own lines so the
        // payment always nets against the correct receivable, not a
        // hardcoded assumption.
        const je = await tx.journalEntry.findUnique({
          where: { id: invoice.journalEntryId! },
          include: { lines: true },
        });
        counterpartAccountId = je!.lines.find(
          (l) => decToNum(l.debit) > 0,
        )!.accountId;
      } else {
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
        const je = await tx.journalEntry.findUnique({
          where: { id: bill.journalEntryId! },
          include: { lines: true },
        });
        counterpartAccountId = je!.lines.find(
          (l) => decToNum(l.credit) > 0,
        )!.accountId;
      }

      const journalEntry = await postJournalEntry(tx, {
        date: new Date(date),
        memo:
          type === "RECEIVED"
            ? `Payment received for invoice`
            : `Payment made for bill`,
        source: "PAYMENT",
        createdById: req.user!.id,
        lines:
          type === "RECEIVED"
            ? [
                { accountId: bankAccountId, debit: amount },
                { accountId: counterpartAccountId, credit: amount },
              ]
            : [
                { accountId: counterpartAccountId, debit: amount },
                { accountId: bankAccountId, credit: amount },
              ],
      });

      const created = await tx.payment.create({
        data: {
          type,
          date: new Date(date),
          amount,
          method,
          invoiceId,
          billId,
          bankAccountId,
          createdById: req.user!.id,
          journalEntryId: journalEntry.id,
        },
      });

      if (invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          include: { lines: true, payments: true },
        });
        const total = round2(
          invoice.lines.reduce(
            (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
            0,
          ),
        );
        const paid = round2(
          invoice.payments.reduce((s, p) => s + decToNum(p.amount), 0),
        );
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: paid >= total ? "PAID" : "PARTIALLY_PAID" },
        });
      }
      if (billId) {
        const bill = await tx.bill.findUniqueOrThrow({
          where: { id: billId },
          include: { lines: true, payments: true },
        });
        const total = round2(
          bill.lines.reduce(
            (s, l) => s + decToNum(l.quantity) * decToNum(l.unitPrice),
            0,
          ),
        );
        const paid = round2(
          bill.payments.reduce((s, p) => s + decToNum(p.amount), 0),
        );
        await tx.bill.update({
          where: { id: billId },
          data: { status: paid >= total ? "PAID" : "PARTIALLY_PAID" },
        });
      }

      return created;
    });
    res.status(201).json(payment);
  } catch (err) {
    if (err instanceof UnbalancedJournalError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// ---- Reports ----

accountingRouter.get("/reports/trial-balance", async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  res.json(await computeTrialBalance({ from, to }));
});

accountingRouter.get("/reports/profit-and-loss", async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  res.json(await computeProfitAndLoss({ from, to }));
});

accountingRouter.get("/reports/balance-sheet", async (req, res) => {
  const { to } = parseDateRange(req.query as Record<string, unknown>);
  res.json(await computeBalanceSheet(to));
});

// ---- IRAS filing summary ----
// Not a tax computation (no add-backs/capital allowances) -- just surfaces
// the two figures every small company needs to start a Form C-S / Form C-S
// (Lite) / ECI filing: Revenue and Net Profit/(Loss) before tax, for a
// chosen financial year. Company name/UEN/GST status are supplied by the
// caller each time rather than stored, since this app has no company
// profile entity.
function suggestedForm(revenue: number) {
  if (revenue <= 200_000) return "Form C-S (Lite)";
  if (revenue <= 5_000_000) return "Form C-S";
  return "Form C (full tax computation required -- use a tax agent)";
}

accountingRouter.get("/reports/iras-summary", async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }
  const pnl = await computeProfitAndLoss({ from, to });
  res.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    revenue: pnl.totalIncome,
    totalExpenses: pnl.totalExpense,
    netProfit: pnl.netProfit,
    suggestedForm: suggestedForm(pnl.totalIncome),
  });
});

accountingRouter.get("/reports/iras-summary.pdf", async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }
  const companyName =
    String(req.query.companyName || "").slice(0, 200) ||
    "(company name not entered)";
  const uen = String(req.query.uen || "").slice(0, 50);
  const gstRegistered = req.query.gstRegistered === "true";
  const pnl = await computeProfitAndLoss({ from, to });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="iras-tax-summary.pdf"`,
  );

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(res);

  doc.fontSize(18).text("Tax Filing Summary", { align: "left" });
  doc
    .fontSize(10)
    .fillColor("#555")
    .text(`Generated ${new Date().toLocaleString()}`);
  doc.moveDown();

  doc.fillColor("#000").fontSize(12);
  doc.text(`Company: ${companyName}`);
  if (uen) doc.text(`UEN: ${uen}`);
  doc.text(
    `Financial year: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
  );
  doc.moveDown();

  doc.font("Helvetica-Bold").text("Figures for IRAS filing (myTax Portal)");
  doc.font("Helvetica");
  doc.moveDown(0.3);
  doc.text(`Revenue: SGD ${pnl.totalIncome.toFixed(2)}`);
  doc.text(`Total expenses: SGD ${pnl.totalExpense.toFixed(2)}`);
  doc.text(`Net profit / (loss) before tax: SGD ${pnl.netProfit.toFixed(2)}`);
  doc.moveDown();

  doc
    .font("Helvetica-Bold")
    .text(`Likely filing: ${suggestedForm(pnl.totalIncome)}`);
  doc.font("Helvetica").fontSize(10).fillColor("#555");
  doc.text(
    "This is a suggestion based on revenue only -- IRAS has other qualifying conditions (e.g. no more than 5 shareholders for Form C-S Lite/C-S). Confirm eligibility on the myTax Portal.",
    { width: 480 },
  );
  doc.moveDown();

  doc.fillColor("#000").fontSize(12);
  if (pnl.income.length > 0) {
    doc.font("Helvetica-Bold").text("Income breakdown");
    doc.font("Helvetica");
    for (const r of pnl.income.filter((r) => r.amount !== 0)) {
      doc.text(`  ${r.name}: SGD ${r.amount.toFixed(2)}`);
    }
    doc.moveDown(0.5);
  }
  if (pnl.expense.length > 0) {
    doc.font("Helvetica-Bold").text("Expense breakdown");
    doc.font("Helvetica");
    for (const r of pnl.expense.filter((r) => r.amount !== 0)) {
      doc.text(`  ${r.name}: SGD ${r.amount.toFixed(2)}`);
    }
    doc.moveDown(0.5);
  }

  doc.moveDown();
  doc.font("Helvetica-Bold").text("GST");
  doc.font("Helvetica").fontSize(10);
  if (gstRegistered) {
    doc.text(
      "This company is marked as GST-registered, but this system does not separate GST from transaction amounts, so no GST F5 figures are included here. Prepare your GST return separately, or ask your accountant.",
      { width: 480 },
    );
  } else {
    doc.text(
      "This company is marked as not GST-registered -- no GST return needed.",
    );
  }

  doc.moveDown();
  doc
    .fontSize(9)
    .fillColor("#888")
    .text(
      "This summary is drawn directly from your bookkeeping records in this system. It is not a substitute for professional tax advice -- it does not include tax adjustments (disallowable expenses, capital allowances, etc.). Review with a qualified tax agent before filing.",
      { width: 480 },
    );

  doc.end();
});
