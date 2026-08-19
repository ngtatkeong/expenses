import "dotenv/config";
import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadUser } from "./auth.js";
import { PrismaSessionStore } from "./sessionStore.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { settingsRouter } from "./routes/settings.js";
import { categoriesRouter } from "./routes/categories.js";
import { expensesRouter } from "./routes/expenses.js";
import { receiptsRouter } from "./routes/receipts.js";
import { fiscalYearRouter } from "./routes/fiscalYear.js";
import { reportsRouter } from "./routes/reports.js";
import { exchangeRatesRouter } from "./routes/exchangeRates.js";
import { accountingRouter } from "./routes/accounting.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 4100);
const isProd = process.env.NODE_ENV === "production";

if (
  isProd &&
  (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET === "dev-secret-change-in-production")
) {
  throw new Error(
    "SESSION_SECRET must be set to a real random value in production (see .env.example)",
  );
}

const app = express();
app.set("trust proxy", 1); // behind Nginx

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    store: new PrismaSessionStore(),
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);
app.use(loadUser);

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/fiscal-years", fiscalYearRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/exchange-rates", exchangeRatesRouter);
app.use("/api/accounting", accountingRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Central error handler — multer file-size/type errors, JSON parse errors, etc.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    res.status(500).json({ error: message });
  },
);

// Serve the built frontend in production
app.use(express.static(DIST_DIR));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Expense Manager server listening on port ${PORT}`);
});
