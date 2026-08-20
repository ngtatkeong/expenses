import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { isLlmConfigured } from "../lib/llm.js";
import { generateExpenseInsights } from "../lib/expenseInsights.js";
import { generateAccountingInsights } from "../lib/accountingInsights.js";

export const aiRouter = Router();

aiRouter.get("/config", (_req, res) => {
  res.json({ enabled: isLlmConfigured() });
});

aiRouter.use(requireAuth);

aiRouter.post(
  "/expense-insights",
  requireRole("ADMIN", "MANAGER"),
  async (req, res) => {
    if (!isLlmConfigured()) {
      return res.status(400).json({ error: "AI insights are not configured" });
    }
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
    if (!isLlmConfigured()) {
      return res.status(400).json({ error: "AI insights are not configured" });
    }
    const insights = await generateAccountingInsights();
    res.json(insights);
  },
);
