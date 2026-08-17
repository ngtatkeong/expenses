import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { api } from "../api/client";
import type { ReportSummary } from "../api/types";
import { formatMoney } from "../utils/format";

const COLORS = [
  "#0f766e",
  "#0ea5e9",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#6366f1",
];

export default function Reports() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [fiscalYear, setFiscalYear] = useState("");

  useEffect(() => {
    const qs = fiscalYear ? `?fiscalYear=${fiscalYear}` : "";
    api.get<ReportSummary>(`/reports/summary${qs}`).then(setSummary);
  }, [fiscalYear]);

  const exportUrl = (kind: "csv" | "pdf") =>
    `/api/reports/export.${kind}${fiscalYear ? `?fiscalYear=${fiscalYear}` : ""}`;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Reports</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            className="btn btn-ghost"
            href={exportUrl("csv")}
            target="_blank"
            rel="noreferrer"
          >
            Export CSV
          </a>
          <a
            className="btn btn-ghost"
            href={exportUrl("pdf")}
            target="_blank"
            rel="noreferrer"
          >
            Export PDF
          </a>
        </div>
      </header>

      <div className="filters-row">
        <label className="field">
          Fiscal year
          <input
            type="number"
            placeholder="All years"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            style={{ width: 140 }}
          />
        </label>
      </div>

      {summary && (
        <>
          <section className="grid-4">
            <div className="stat-card">
              <div className="stat-value">
                {formatMoney(summary.totalAmount)}
              </div>
              <div className="stat-label">Total spend</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.expenseCount}</div>
              <div className="stat-label">Expenses</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.flaggedCount}</div>
              <div className="stat-label">Flagged</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {summary.byStatus.find((s) => s.status === "PENDING_APPROVAL")
                  ?.count ?? 0}
              </div>
              <div className="stat-label">Pending approval</div>
            </div>
          </section>

          <section className="panel">
            <h2>By status</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.byStatus.map((s) => (
                  <tr key={s.status}>
                    <td>{s.status.replace("_", " ")}</td>
                    <td>{s.count}</td>
                    <td>{formatMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>By vendor</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Expenses</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.byVendor.map((v) => (
                  <tr key={v.name}>
                    <td>{v.name}</td>
                    <td>{v.count}</td>
                    <td>{formatMoney(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="grid-3">
            <div className="panel">
              <h2>By category</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={summary.byCategory}
                    dataKey="total"
                    nameKey="name"
                    outerRadius={80}
                  >
                    {summary.byCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h2>By department</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={summary.byDepartment}
                    dataKey="total"
                    nameKey="name"
                    outerRadius={80}
                  >
                    {summary.byDepartment.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h2>By month</h2>
              <table className="data-table">
                <tbody>
                  {summary.byMonth.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td>{formatMoney(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
