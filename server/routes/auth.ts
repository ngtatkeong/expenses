import { Router } from "express";
import { prisma } from "../db.js";
import { verifyPassword, hashPassword, requireAuth } from "../auth.js";
import { writeAudit } from "../lib/audit.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase() },
  });
  if (!user || !user.active)
    return res.status(401).json({ error: "Invalid email or password" });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  req.session.userId = user.id;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
  });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// Self-service password change — any logged-in user, for their own account
// only. Requires the current password (unlike the admin-only
// PATCH /api/users/:id, which can set anyone's password without it).
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current and new password are required" });
  }
  if (String(newPassword).length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters" });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
  });
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok)
    return res.status(401).json({ error: "Current password is incorrect" });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await writeAudit(prisma, {
    entityType: "User",
    entityId: user.id,
    action: "USER_UPDATED",
    actorId: user.id,
    comment: "Changed own password",
  });
  res.json({ ok: true });
});
