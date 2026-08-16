import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useAuth } from "../store/AuthContext";
import { api } from "../api/client";
import type { Expense, ReportSummary } from "../api/types";
import StatusBadge from "../components/StatusBadge";
import { formatMoney, formatDate } from "../utils/format";

const COLORS = [
  "#0f766e",
  "#0ea5e9",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#6366f1",
];

export default function Dashboard() {
  const { user } = useAuth();
  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [approvalQueueCount, setApprovalQueueCount] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!user) return;
    api
      .get<Expense[]>(`/expenses?submittedById=${user.id}`)
      .then(setMyExpenses)
      .catch(() => {});
    if (user?.role === "ADMIN") {
      api
        .get<ReportSummary>("/reports/summary")
        .catch(() => null)
        .then((s) => s && setSummary(s));
    }
    if (user?.role === "MANAGER" || user?.role === "ADMIN") {
      api
        .get<Expense[]>("/expenses?status=PENDING_APPROVAL")
        .then((list) => setApprovalQueueCount(list.length))
        .catch(() => {});
    }
  }, [user]);

  const pending = myExpenses.filter(
    (e) => e.status === "PENDING_APPROVAL" || e.status === "INFO_REQUESTED",
  ).length;
  const drafts = myExpenses.filter((e) => e.status === "DRAFT").length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p className="muted">
            Role:{" "}
            {user ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : ""}
          </p>
        </div>
        <Link to="/expenses/new" className="btn">
          + New Expense
        </Link>
      </header>

      <section className="grid-4">
        <div className="stat-card">
          <div className="stat-value">{myExpenses.length}</div>
          <div className="stat-label">My expenses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{drafts}</div>
          <div className="stat-label">Drafts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pending}</div>
          <div className="stat-label">Awaiting action</div>
        </div>
        {approvalQueueCount !== null && (
          <div className="stat-card">
            <div className="stat-value">{approvalQueueCount}</div>
            <div className="stat-label">In approval queue</div>
          </div>
        )}
      </section>

      {(user?.role === "MANAGER" || user?.role === "ADMIN") &&
        approvalQueueCount !== null &&
        approvalQueueCount > 0 && (
          <div className="callout callout-warn">
            {approvalQueueCount} expense(s) waiting for your approval.{" "}
            <Link to="/expenses?status=PENDING_APPROVAL">Review now →</Link>
          </div>
        )}

      {summary && (
        <section className="grid-3">
          <div className="panel">
            <h2>Spend by category</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={summary.byCategory}
                  dataKey="total"
                  nameKey="name"
                  outerRadius={80}
                  label={(d) => d.name}
                >
                  {summary.byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="panel">
            <h2>Spend by department</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.byDepartment}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
                <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="panel">
            <h2>Spend by month</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
                <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>My recent expenses</h2>
          <Link to="/expenses">View all →</Link>
        </div>
        {myExpenses.length === 0 ? (
          <p className="muted small">No expenses yet. Create your first one.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {myExpenses.slice(0, 6).map((e) => (
                <tr
                  key={e.id}
                  className="clickable"
                  onClick={() => (window.location.href = `/expenses/${e.id}`)}
                >
                  <td>{formatDate(e.date)}</td>
                  <td>{e.vendor}</td>
                  <td>{formatMoney(e.amountTotal, e.currency)}</td>
                  <td>
                    <StatusBadge status={e.status} />{" "}
                    {e.flagged && (
                      <span className="badge badge-flagged">Flagged</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
