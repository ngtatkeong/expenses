import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { FiscalYearSummary } from "../api/types";
import { formatMoney, formatDateTime } from "../utils/format";

export default function FiscalYears() {
  const [years, setYears] = useState<FiscalYearSummary[]>([]);
  const [error, setError] = useState("");

  function load() {
    api.get<FiscalYearSummary[]>("/fiscal-years").then(setYears);
  }
  useEffect(load, []);

  async function lock(year: number) {
    if (
      !confirm(
        `Lock FY${year}? No further edits, receipts, or payments will be possible for expenses in this year.`,
      )
    )
      return;
    setError("");
    try {
      await api.post(`/fiscal-years/${year}/lock`);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to lock fiscal year",
      );
    }
  }

  async function unlock(year: number) {
    if (!confirm(`Re-open FY${year} for edits?`)) return;
    await api.post(`/fiscal-years/${year}/unlock`);
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Fiscal Year Consolidation</h1>
      </header>

      <p className="muted small">
        Lock a fiscal year once all its expenses are Paid or Rejected — locked
        years become read-only for compliance and tax filing purposes. All
        expenses must be resolved (Paid or Rejected) before a year can be
        locked.
      </p>
      {error && <p className="error-text">{error}</p>}

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fiscal Year</th>
              <th>Expenses</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year}>
                <td>FY{y.year}</td>
                <td>{y.expenseCount}</td>
                <td>{formatMoney(y.totalAmount)}</td>
                <td>
                  {y.locked ? (
                    <span className="badge badge-role">
                      Locked
                      {y.lockedAt ? ` · ${formatDateTime(y.lockedAt)}` : ""}
                    </span>
                  ) : (
                    <span className="badge badge-draft">Open</span>
                  )}
                </td>
                <td>
                  {y.locked ? (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => unlock(y.year)}
                    >
                      Re-open
                    </button>
                  ) : (
                    <button className="btn btn-sm" onClick={() => lock(y.year)}>
                      Lock
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
