import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";
import type { Role } from "@prisma/client";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
  managerId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Loads the logged-in user (if any) onto req.user for every request.
export async function loadUser(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const userId = req.session.userId;
  if (!userId) return next();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && user.active) {
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      managerId: user.managerId,
    };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Not logged in" });
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not permitted for your role" });
    }
    next();
  };
}
