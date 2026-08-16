import { Router } from "express";
import { prisma } from "../db.js";
import { verifyPassword, requireAuth } from "../auth.js";

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
