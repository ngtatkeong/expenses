import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { writeAudit } from "../lib/audit.js";
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_RATES_TO_SGD,
} from "../lib/currencies.js";

export const exchangeRatesRouter = Router();
exchangeRatesRouter.use(requireAuth);

// Returns every supported non-SGD currency with its current rate, seeding a
// default the first time a currency is requested so the list is always
// complete (SGD itself isn't stored -- it's implicitly 1).
exchangeRatesRouter.get("/", async (_req, res) => {
  const existing = await prisma.exchangeRate.findMany();
  const byCurrency = new Map(existing.map((r) => [r.currency, r]));
  const missing = SUPPORTED_CURRENCIES.filter((c) => !byCurrency.has(c));

  if (missing.length > 0) {
    await prisma.$transaction(
      missing.map((currency) =>
        prisma.exchangeRate.upsert({
          where: { currency },
          update: {},
          create: { currency, rateToSgd: DEFAULT_RATES_TO_SGD[currency] ?? 1 },
        }),
      ),
    );
  }

  const rates = await prisma.exchangeRate.findMany({
    orderBy: { currency: "asc" },
  });
  res.json(rates);
});

exchangeRatesRouter.put(
  "/:currency",
  requireRole("ADMIN"),
  async (req, res) => {
    const currency = (req.params.currency as string).toUpperCase();
    const { rateToSgd } = req.body ?? {};
    const rate = Number(rateToSgd);
    if (!rate || rate <= 0) {
      return res
        .status(400)
        .json({ error: "rateToSgd must be a positive number" });
    }
    if (currency === "SGD") {
      return res
        .status(400)
        .json({ error: "SGD is always 1 and can't be changed" });
    }

    const before = await prisma.exchangeRate.findUnique({
      where: { currency },
    });
    const updated = await prisma.exchangeRate.upsert({
      where: { currency },
      update: { rateToSgd: rate },
      create: { currency, rateToSgd: rate },
    });
    await writeAudit(prisma, {
      entityType: "ExchangeRate",
      entityId: currency,
      action: "SETTINGS_CHANGED",
      actorId: req.user!.id,
      before,
      after: updated,
    });
    res.json(updated);
  },
);
