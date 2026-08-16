import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { writeAudit } from "../lib/audit.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

async function getOrCreateSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

settingsRouter.get("/", async (_req, res) => {
  res.json(await getOrCreateSettings());
});

settingsRouter.put("/", requireRole("ADMIN"), async (req, res) => {
  const before = await getOrCreateSettings();
  const {
    approvalWorkflowEnabled,
    defaultCurrency,
    fiscalYearStartMonth,
    receiptRequiredAbove,
  } = req.body ?? {};

  const data: Record<string, unknown> = {};
  if (approvalWorkflowEnabled !== undefined)
    data.approvalWorkflowEnabled = !!approvalWorkflowEnabled;
  if (defaultCurrency !== undefined) data.defaultCurrency = defaultCurrency;
  if (fiscalYearStartMonth !== undefined)
    data.fiscalYearStartMonth = Number(fiscalYearStartMonth);
  if (receiptRequiredAbove !== undefined)
    data.receiptRequiredAbove = Number(receiptRequiredAbove);

  const settings = await prisma.settings.update({ where: { id: 1 }, data });
  await writeAudit(prisma, {
    entityType: "Settings",
    entityId: "1",
    action: "SETTINGS_CHANGED",
    actorId: req.user!.id,
    before,
    after: settings,
  });
  res.json(settings);
});
