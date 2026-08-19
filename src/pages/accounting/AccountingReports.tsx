import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  BalanceSheet,
  ProfitAndLoss,
  TrialBalanceRow,
} from "../../api/accountingTypes";
import { formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

type Tab = "trial-balance" | "pnl" | "balance-sheet";

export default function AccountingReports() {
  const [tab, setTab] = useState<Tab>("pnl");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [pnl, setPnl] = useState<ProfitAndLoss | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const qsStr = qs.toString() ? `?${qs}` : "";
    if (tab === "trial-balance")
      api
        .get<TrialBalanceRow[]>(`/accounting/reports/trial-balance${qsStr}`)
        .then(setTrialBalance);
    if (tab === "pnl")
      api
        .get<ProfitAndLoss>(`/accounting/reports/profit-and-loss${qsStr}`)
        .then(setPnl);
    if (tab === "balance-sheet")
      api
        .get<BalanceSheet>(`/accounting/reports/balance-sheet${qsStr}`)
        .then(setBalanceSheet);
  }, [tab, from, to]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Accounting Reports</h1>
      </header>

      <AccountingNav />

      <div className="filters-row">
        <button
          className={`btn btn-sm ${tab === "pnl" ? "" : "btn-ghost"}`}
          onClick={() => setTab("pnl")}
        >
          Profit & Loss
        </button>
        <button
          className={`btn btn-sm ${tab === "balance-sheet" ? "" : "btn-ghost"}`}
          onClick={() => setTab("balance-sheet")}
        >
          Balance Sheet
        </button>
        <button
          className={`btn btn-sm ${tab === "trial-balance" ? "" : "btn-ghost"}`}
          onClick={() => setTab("trial-balance")}
        >
          Trial Balance
        </button>
      </div>

      <div className="filters-row">
        <label className="field">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          {tab === "balance-sheet" ? "As of" : "To"}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      {tab === "trial-balance" && (
        <section className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance
                .filter((r) => r.debit !== 0 || r.credit !== 0)
                .map((r) => (
                  <tr key={r.accountId}>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td>{r.type}</td>
                    <td>{formatMoney(r.debit)}</td>
                    <td>{formatMoney(r.credit)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "pnl" && pnl && (
        <section className="panel">
          <h2>Income</h2>
          <table className="data-table">
            <tbody>
              {pnl.income.map((r) => (
                <tr key={r.accountId}>
                  <td>
                    {r.code} {r.name}
                  </td>
                  <td>{formatMoney(r.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total income</strong>
                </td>
                <td>
                  <strong>{formatMoney(pnl.totalIncome)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <h2 style={{ marginTop: 16 }}>Expenses</h2>
          <table className="data-table">
            <tbody>
              {pnl.expense.map((r) => (
                <tr key={r.accountId}>
                  <td>
                    {r.code} {r.name}
                  </td>
                  <td>{formatMoney(r.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total expenses</strong>
                </td>
                <td>
                  <strong>{formatMoney(pnl.totalExpense)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="stat-card" style={{ marginTop: 16 }}>
            <div className="stat-value">{formatMoney(pnl.netProfit)}</div>
            <div className="stat-label">
              Net {pnl.netProfit >= 0 ? "profit" : "loss"}
            </div>
          </div>
        </section>
      )}

      {tab === "balance-sheet" && balanceSheet && (
        <section className="panel">
          <h2>Assets</h2>
          <table className="data-table">
            <tbody>
              {balanceSheet.assets.map((r) => (
                <tr key={r.accountId}>
                  <td>
                    {r.code} {r.name}
                  </td>
                  <td>{formatMoney(r.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total assets</strong>
                </td>
                <td>
                  <strong>{formatMoney(balanceSheet.totalAssets)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <h2 style={{ marginTop: 16 }}>Liabilities</h2>
          <table className="data-table">
            <tbody>
              {balanceSheet.liabilities.map((r) => (
                <tr key={r.accountId}>
                  <td>
                    {r.code} {r.name}
                  </td>
                  <td>{formatMoney(r.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total liabilities</strong>
                </td>
                <td>
                  <strong>{formatMoney(balanceSheet.totalLiabilities)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <h2 style={{ marginTop: 16 }}>Equity</h2>
          <table className="data-table">
            <tbody>
              {balanceSheet.equity.map((r) => (
                <tr key={r.accountId}>
                  <td>
                    {r.code} {r.name}
                  </td>
                  <td>{formatMoney(r.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>Current year earnings</td>
                <td>{formatMoney(balanceSheet.currentYearEarnings)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Total equity</strong>
                </td>
                <td>
                  <strong>{formatMoney(balanceSheet.totalEquity)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          {!balanceSheet.balances && (
            <p className="error-text" style={{ marginTop: 12 }}>
              Assets do not equal liabilities + equity — check recent journal
              entries for an unbalanced posting.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
