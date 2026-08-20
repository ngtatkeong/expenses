import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { isLlmConfigured } from "../lib/llm.js";
import { generateExpenseInsights } from "../lib/expenseInsights.js";
import { generateAccountingInsights } from "../lib/accountingInsights.js";
import {
  parseExpenseText,
  checkExpensePolicy,
  generateApprovalNote,
  checkReceiptMatch,
} from "../lib/expenseAi.js";
import {
  parseTransactionText,
  draftPaymentReminder,
  computeCashFlowForecast,
  reconcileStatement,
  parseOtherTransactionText,
  parsePaymentText,
  suggestCategories,
} from "../lib/accountingAi.js";

export const aiRouter = Router();

aiRouter.get("/config", (_req, res) => {
  res.json({ enabled: isLlmConfigured() });
});

aiRouter.use(requireAuth);

function requireAiConfigured(
  _req: unknown,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  if (!isLlmConfigured()) {
    return res.status(400).json({ error: "AI features are not configured" });
  }
  next();
}
aiRouter.use(requireAiConfigured);

// ---- Insights (existing) ----

aiRouter.post(
  "/expense-insights",
  requireRole("ADMIN", "MANAGER"),
  async (req, res) => {
    const { fiscalYear, department } = req.body as {
      fiscalYear?: number;
      department?: string;
    };
    const insights = await generateExpenseInsights({ fiscalYear, department });
    res.json(insights);
  },
);

aiRouter.post(
  "/accounting-insights",
  requireRole("ADMIN"),
  async (_req, res) => {
    const insights = await generateAccountingInsights();
    res.json(insights);
  },
);

// ---- Expenses: natural-language / receipt-text entry ----

aiRouter.post("/parse-expense-text", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });
  const parsed = await parseExpenseText(text);
  res.json(parsed);
});

// ---- Expenses: pre-submit policy check ----

aiRouter.post("/expense-policy-check", async (req, res) => {
  const { vendor, amountTotal, currency, categoryId, date } = req.body as {
    vendor?: string;
    amountTotal?: number;
    currency?: string;
    categoryId?: string;
    date?: string;
  };
  if (!vendor || !amountTotal || !currency || !categoryId || !date) {
    return res.status(400).json({
      error: "vendor, amountTotal, currency, categoryId, and date are required",
    });
  }
  const result = await checkExpensePolicy({
    submittedById: req.user!.id,
    vendor,
    amountTotal,
    currency,
    categoryId,
    date,
  });
  res.json(result);
});

// ---- Expenses: approval assistant ----

aiRouter.post(
  "/approval-note",
  requireRole("ADMIN", "MANAGER"),
  async (req, res) => {
    const { expenseId } = req.body as { expenseId?: string };
    if (!expenseId)
      return res.status(400).json({ error: "expenseId is required" });
    const result = await generateApprovalNote(expenseId);
    res.json(result);
  },
);

// ---- Accounting: natural-language transaction entry ----

aiRouter.post(
  "/parse-transaction-text",
  requireRole("ADMIN"),
  async (req, res) => {
    const { text, kind } = req.body as {
      text?: string;
      kind?: "sale" | "expense";
    };
    if (!text?.trim() || (kind !== "sale" && kind !== "expense")) {
      return res
        .status(400)
        .json({ error: "text and kind ('sale'|'expense') are required" });
    }
    const parsed = await parseTransactionText(text, kind);
    res.json(parsed);
  },
);

// ---- Accounting: payment reminder drafting ----

aiRouter.post("/payment-reminder", requireRole("ADMIN"), async (req, res) => {
  const { invoiceId } = req.body as { invoiceId?: string };
  if (!invoiceId)
    return res.status(400).json({ error: "invoiceId is required" });
  const result = await draftPaymentReminder(invoiceId);
  res.json(result);
});

// ---- Accounting: cash flow forecast ----

aiRouter.get("/cash-flow-forecast", requireRole("ADMIN"), async (_req, res) => {
  const forecast = await computeCashFlowForecast();
  res.json(forecast);
});

// ---- Accounting: bank statement reconciliation ----

aiRouter.post(
  "/reconcile-statement",
  requireRole("ADMIN"),
  async (req, res) => {
    const { statementText } = req.body as { statementText?: string };
    if (!statementText?.trim()) {
      return res.status(400).json({ error: "statementText is required" });
    }
    const result = await reconcileStatement(statementText);
    res.json(result);
  },
);

// ---- Accounting: "record something else" natural-language entry ----

aiRouter.post(
  "/parse-other-transaction-text",
  requireRole("ADMIN"),
  async (req, res) => {
    const { text } = req.body as { text?: string };
    if (!text?.trim())
      return res.status(400).json({ error: "text is required" });
    const parsed = await parseOtherTransactionText(text);
    res.json(parsed);
  },
);

// ---- Accounting: payment natural-language entry ----

aiRouter.post("/parse-payment-text", requireRole("ADMIN"), async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });
  const parsed = await parsePaymentText(text);
  res.json(parsed);
});

// ---- Accounting: AI-suggested starter categories ----

aiRouter.post("/suggest-categories", requireRole("ADMIN"), async (req, res) => {
  const { businessDescription } = req.body as { businessDescription?: string };
  if (!businessDescription?.trim()) {
    return res.status(400).json({ error: "businessDescription is required" });
  }
  const suggestions = await suggestCategories(businessDescription);
  res.json({ suggestions });
});

// ---- Expenses: receipt-vs-claim mismatch check ----

aiRouter.post("/check-receipt-match", async (req, res) => {
  const { expenseId, receiptText } = req.body as {
    expenseId?: string;
    receiptText?: string;
  };
  if (!expenseId || !receiptText?.trim()) {
    return res
      .status(400)
      .json({ error: "expenseId and receiptText are required" });
  }
  const result = await checkReceiptMatch(expenseId, receiptText);
  res.json(result);
});
