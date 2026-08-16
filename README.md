# Expense Management System

A multi-role expense management system: employees submit expenses with
receipts, managers approve/reject/request info, and Finance/Admin
configures policy, processes payments, and reports company-wide spend.

**Live**: [https://exp.kaoinai.com](https://exp.kaoinai.com) (real accounts —
email + password, no self-signup; an admin creates users).

## Roles

| Role              | Can do                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Employee**      | Submit expenses (with multi-category line items + receipts), track their own reimbursement status                         |
| **Manager**       | Everything an Employee can, plus review/approve/reject/request-info on their reports' submissions                         |
| **Admin/Finance** | Everything above, plus manage users/categories/settings, mark expenses paid, lock fiscal years, view company-wide reports |

## Core features

- **Toggleable approval workflow** — Settings has a master switch: when on,
  submissions route to the submitter's manager; when off, submissions go
  straight to Approved (ready for payment), bypassing manager review
  entirely.
- **Multi-category expense splitting** — one expense can have several line
  items, each tagged to its own category and amount.
- **Receipts stored on the VPS filesystem** (not just referenced) — access
  is authenticated and scoped to the expense's owner/approver/admin, never
  served as plain static files.
- **Policy flags** — configurable per-category spending limits, and a
  missing-receipt-above-threshold flag, both editable in Settings.
- **Fiscal year consolidation & locking** — group/filter by fiscal year;
  locking a year (once everything in it is Paid or Rejected) makes its
  expenses read-only for tax/audit purposes.
- **Strict audit trail** — every create/edit/submit/approve/reject/pay/etc.
  is logged with who + when, and the log table is genuinely append-only:
  enforced both by never exposing an update/delete route for it _and_ by a
  SQLite trigger that rejects UPDATE/DELETE at the database level.
- **Dashboards & export** — spend by category/department/month
  (`recharts`), CSV export, and a generated PDF report.

## Architecture

- **Frontend**: React 19 + TypeScript + Vite, React Router, `recharts` for
  charts, hand-written CSS (no framework).
- **Backend**: Node.js + Express + TypeScript (run directly via `tsx`, no
  separate compile step), session-based auth (`express-session` +
  `bcryptjs`), `multer` for file uploads.
- **Database**: SQLite via Prisma (`prisma/schema.prisma`) — a single file,
  easy to back up, no separate DB service needed. Sessions are also stored
  in it (a custom `express-session` store), so logins survive a redeploy.
- **File storage**: receipts saved under `uploads/<expenseId>/` on disk,
  served through an authenticated route rather than static hosting.

## Local development

```bash
npm install
npx prisma migrate dev      # creates prisma/dev.db and applies migrations
npx tsx server/seed.ts      # creates an admin login + starter categories
npm run dev                 # Vite dev server on :5175 (see vite.config.ts)
npm run dev:server          # Express API on :4100, in a second terminal
```

Seeded admin login defaults to `admin@example.com` / `ChangeMe123!` unless
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are set in `.env`.

Typecheck + build:

```bash
npx tsc -b                              # frontend
npx tsc --noEmit -p tsconfig.server.json  # backend
npm run build                           # tsc -b && vite build → dist/
```

## Deployment

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for the full runbook.
