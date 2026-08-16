import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole, hashPassword } from "../auth.js";
import { writeAudit } from "../lib/audit.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  department: true,
  managerId: true,
  active: true,
  createdAt: true,
} as const;

// Any logged-in user can see a light directory (needed to pick a manager,
// show names on expenses, etc.) — only admins can mutate.
usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: publicUser,
    orderBy: { name: "asc" },
  });
  res.json(users);
});

usersRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const { email, password, name, role, department, managerId } = req.body ?? {};
  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ error: "email, password, and name are required" });
  }
  const existing = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase() },
  });
  if (existing)
    return res
      .status(409)
      .json({ error: "A user with that email already exists" });

  const user = await prisma.user.create({
    data: {
      email: String(email).toLowerCase(),
      passwordHash: await hashPassword(password),
      name,
      role: role ?? "EMPLOYEE",
      department: department || null,
      managerId: managerId || null,
    },
    select: publicUser,
  });
  await writeAudit(prisma, {
    entityType: "User",
    entityId: user.id,
    action: "USER_CREATED",
    actorId: req.user!.id,
    after: user,
  });
  res.status(201).json(user);
});

usersRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const before = await prisma.user.findUnique({
    where: { id },
    select: publicUser,
  });
  if (!before) return res.status(404).json({ error: "User not found" });

  const { name, role, department, managerId, active, password } =
    req.body ?? {};

  // Guard against locking everyone out of the admin section: block a change
  // that would leave zero active ADMIN accounts (demoting the last admin,
  // or deactivating them). This is what actually happened once already —
  // a lone admin used this same role dropdown on their own row and got
  // silently locked out with no way to undo it themselves.
  const losingAdminStatus =
    before.role === "ADMIN" &&
    ((role !== undefined && role !== "ADMIN") || active === false);
  if (losingAdminStatus) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return res.status(409).json({
        error:
          "Can't remove the last remaining admin — promote another user to Admin first.",
      });
    }
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (department !== undefined) data.department = department || null;
  if (managerId !== undefined) data.managerId = managerId || null;
  if (active !== undefined) data.active = active;
  if (password) data.passwordHash = await hashPassword(password);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: publicUser,
  });
  await writeAudit(prisma, {
    entityType: "User",
    entityId: user.id,
    action: active === false ? "USER_DEACTIVATED" : "USER_UPDATED",
    actorId: req.user!.id,
    before,
    after: user,
  });
  res.json(user);
});
