import { Store } from "express-session";
import type { SessionData } from "express-session";
import { prisma } from "./db.js";

// Sessions persisted in the same SQLite DB (via Prisma) instead of the
// default in-memory store, so logging in survives a service restart or
// redeploy rather than silently logging everyone out.
export class PrismaSessionStore extends Store {
  get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void,
  ) {
    prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row || row.expiresAt < new Date()) return callback(null, null);
        callback(null, JSON.parse(row.data));
      })
      .catch(callback);
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void) {
    const expiresAt = session.cookie.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + 86400000);
    const userId =
      (session as SessionData & { userId?: string }).userId ?? null;
    prisma.session
      .upsert({
        where: { sid },
        create: { sid, data: JSON.stringify(session), expiresAt, userId },
        update: { data: JSON.stringify(session), expiresAt, userId },
      })
      .then(() => callback?.())
      .catch(callback);
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    prisma.session
      .delete({ where: { sid } })
      .then(() => callback?.())
      .catch(() => callback?.()); // already gone is fine
  }

  touch(sid: string, session: SessionData, callback?: (err?: unknown) => void) {
    const expiresAt = session.cookie.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + 86400000);
    prisma.session
      .update({ where: { sid }, data: { expiresAt } })
      .then(() => callback?.())
      .catch(() => callback?.());
  }
}
