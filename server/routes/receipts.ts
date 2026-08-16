import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { writeAudit } from "../lib/audit.js";
import { recomputeExpenseFlags } from "../lib/policy-recompute.js";

export const receiptsRouter = Router();
receiptsRouter.use(requireAuth);

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "./uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new Error("Only JPEG, PNG, WEBP, HEIC, or PDF receipts are allowed"),
      );
    }
    cb(null, true);
  },
});

async function canAccessExpense(
  userId: string,
  role: string,
  expenseId: string,
) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { submittedBy: { select: { managerId: true } } },
  });
  if (!expense) return null;
  if (role === "ADMIN") return expense;
  if (expense.submittedById === userId) return expense;
  if (
    role === "MANAGER" &&
    (expense.currentApproverId === userId ||
      expense.submittedBy.managerId === userId)
  ) {
    return expense;
  }
  return null;
}

receiptsRouter.post(
  "/expense/:expenseId",
  upload.single("file"),
  async (req, res) => {
    const expenseId = req.params.expenseId as string;
    const expense = await canAccessExpense(
      req.user!.id,
      req.user!.role,
      expenseId,
    );
    if (!expense)
      return res
        .status(403)
        .json({ error: "Not permitted or expense not found" });
    if (expense.locked)
      return res
        .status(409)
        .json({ error: "This expense's fiscal year is locked" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const expenseDir = path.join(UPLOADS_DIR, expenseId);
    fs.mkdirSync(expenseDir, { recursive: true });
    const ext = path.extname(req.file.originalname) || "";
    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(expenseDir, filename), req.file.buffer);

    const receipt = await prisma.receipt.create({
      data: {
        expenseId,
        filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedById: req.user!.id,
      },
    });
    await writeAudit(prisma, {
      entityType: "Expense",
      entityId: expenseId,
      action: "RECEIPT_ADDED",
      actorId: req.user!.id,
      after: { receiptId: receipt.id, originalName: receipt.originalName },
      expenseId,
    });
    await recomputeExpenseFlags(expenseId);
    res.status(201).json(receipt);
  },
);

receiptsRouter.get("/:id/file", async (req, res) => {
  const receipt = await prisma.receipt.findUnique({
    where: { id: (req.params.id as string) },
  });
  if (!receipt) return res.status(404).json({ error: "Receipt not found" });
  const expense = await canAccessExpense(
    req.user!.id,
    req.user!.role,
    receipt.expenseId,
  );
  if (!expense) return res.status(403).json({ error: "Not permitted" });

  const filePath = path.join(UPLOADS_DIR, receipt.expenseId, receipt.filename);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File missing on disk" });
  res.setHeader("Content-Type", receipt.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${receipt.originalName.replace(/"/g, "")}"`,
  );
  fs.createReadStream(filePath).pipe(res);
});

receiptsRouter.delete("/:id", async (req, res) => {
  const receipt = await prisma.receipt.findUnique({
    where: { id: (req.params.id as string) },
  });
  if (!receipt) return res.status(404).json({ error: "Receipt not found" });
  const expense = await canAccessExpense(
    req.user!.id,
    req.user!.role,
    receipt.expenseId,
  );
  if (!expense) return res.status(403).json({ error: "Not permitted" });
  if (expense.locked)
    return res
      .status(409)
      .json({ error: "This expense's fiscal year is locked" });
  if (
    !["DRAFT", "INFO_REQUESTED"].includes(expense.status) &&
    req.user!.role !== "ADMIN"
  ) {
    return res
      .status(409)
      .json({ error: "Cannot remove receipts once submitted for approval" });
  }

  const filePath = path.join(UPLOADS_DIR, receipt.expenseId, receipt.filename);
  await prisma.receipt.delete({ where: { id: receipt.id } });
  fs.rm(filePath, { force: true }, () => {});
  await writeAudit(prisma, {
    entityType: "Expense",
    entityId: receipt.expenseId,
    action: "RECEIPT_REMOVED",
    actorId: req.user!.id,
    before: { receiptId: receipt.id, originalName: receipt.originalName },
    expenseId: receipt.expenseId,
  });
  await recomputeExpenseFlags(receipt.expenseId);
  res.json({ ok: true });
});
