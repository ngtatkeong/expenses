import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import type { BalanceSheet, ProfitAndLoss } from "../../../api/accountingTypes";
import { formatMoney } from "../../../utils/format";

const RANGES = [
  { label: "This month", months: 1 },
  { label: "Last 3 months", months: 3 },
  { label: "This year", months: 12 },
  { label: "All time", months: 0 },
];

function rangeFrom(months: number): string | undefined {
  if (months === 0) return undefined;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export default function ReportsWizard() {
  const [rangeIdx, setRangeIdx] = useState(2);
  const [pnl, setPnl] = useState<ProfitAndLoss | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);

  useEffect(() => {
    const from = rangeFrom(RANGES[rangeIdx].months);
    const qs = from ? `?from=${from}` : "";
    api
      .get<ProfitAndLoss>(`/accounting/reports/profit-and-loss${qs}`)
      .then(setPnl);
    api
      .get<BalanceSheet>("/accounting/reports/balance-sheet")
      .then(setBalanceSheet);
  }, [rangeIdx]);

  const profit = pnl?.netProfit ?? 0;
  const isProfit = profit >= 0;
  const incomeLines = pnl?.income.filter((r) => r.amount !== 0) ?? [];
  const expenseLines = pnl?.expense.filter((r) => r.amount !== 0) ?? [];

  return (
    <div className="page">
      <Link to="/accounting" className="back-link">
        ← Accounting
      </Link>
      <header className="page-header">
        <h1>How is the business doing?</h1>
        <p className="muted">In plain terms — no accounting jargon.</p>
      </header>

      <div className="filters-row">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            className={`btn btn-sm ${i === rangeIdx ? "" : "btn-ghost"}`}
            onClick={() => setRangeIdx(i)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>{RANGES[rangeIdx].label}: are you making money?</h2>
        {pnl && (
          <>
            <div className="grid-3">
              <div className="stat-card">
                <div className="stat-value">{formatMoney(pnl.totalIncome)}</div>
                <div className="stat-label">Money coming in</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {formatMoney(pnl.totalExpense)}
                </div>
                <div className="stat-label">Money going out</div>
              </div>
              <div className="stat-card">
                <div
                  className="stat-value"
                  style={{ color: isProfit ? "#16a34a" : "#dc2626" }}
                >
                  {formatMoney(profit)}
                </div>
                <div className="stat-label">{isProfit ? "Profit" : "Loss"}</div>
              </div>
            </div>

            {incomeLines.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Where the money came in from</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {incomeLines.map((r) => (
                    <li key={r.accountId}>
                      {r.name}: {formatMoney(r.amount)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {expenseLines.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Where the money went</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {expenseLines.map((r) => (
                    <li key={r.accountId}>
                      {r.name}: {formatMoney(r.amount)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {incomeLines.length === 0 && expenseLines.length === 0 && (
              <p className="muted small">
                Nothing recorded in this period yet.
              </p>
            )}
          </>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Right now: what do you own vs owe?</h2>
        {balanceSheet && (
          <>
            <div className="grid-3">
              <div className="stat-card">
                <div className="stat-value">
                  {formatMoney(balanceSheet.totalAssets)}
                </div>
                <div className="stat-label">
                  What the business owns (cash, money owed to you…)
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {formatMoney(balanceSheet.totalLiabilities)}
                </div>
                <div className="stat-label">What the business owes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {formatMoney(balanceSheet.totalEquity)}
                </div>
                <div className="stat-label">Net worth (owns minus owes)</div>
              </div>
            </div>
            {!balanceSheet.balances && (
              <p className="error-text" style={{ marginTop: 12 }}>
                Something doesn't add up — talk to your accountant, or check{" "}
                <Link to="/accounting/journal-entries">
                  the full transaction history
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>

      <p className="muted small" style={{ marginTop: 16 }}>
        Need the full technical reports for your accountant?{" "}
        <Link to="/accounting/reports">Open the detailed reports</Link>.
      </p>
    </div>
  );
}
