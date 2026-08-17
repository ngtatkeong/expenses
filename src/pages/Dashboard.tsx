import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { api } from "../api/client";
import type {
  Expense,
  ExchangeRate,
  ReportSummary,
  SpendItem,
} from "../api/types";
import StatusBadge from "../components/StatusBadge";
import SpendBreakdown from "../components/SpendBreakdown";
import { formatMoney, formatDate } from "../utils/format";
import { toSgd } from "../utils/currency";

export default function Dashboard() {
  const { user } = useAuth();
  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [approvalQueueCount, setApprovalQueueCount] = useState<number | null>(
    null,
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const isLead = user?.role === "ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    if (!user) return;
    api
      .get<Expense[]>(`/expenses?submittedById=${user.id}`)
      .then(setMyExpenses)
      .catch(() => {});
    api
      .get<ExchangeRate[]>("/exchange-rates")
      .then(setRates)
      .catch(() => {});
    if (isLead) {
      api
        .get<ReportSummary>("/reports/summary")
        .catch(() => null)
        .then((s) => s && setSummary(s));
      api
        .get<Expense[]>("/expenses?status=PENDING_APPROVAL")
        .then((list) => setApprovalQueueCount(list.length))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pending = myExpenses.filter(
    (e) => e.status === "PENDING_APPROVAL" || e.status === "INFO_REQUESTED",
  ).length;
  const drafts = myExpenses.filter((e) => e.status === "DRAFT").length;

  // Employees don't get the /reports/summary endpoint (it's team/company
  // scoped) — derive the same item/category breakdown from their own
  // expenses client-side instead, so everyone sees a breakdown of *something*.
  // Everything is converted to SGD first so expenses in different currencies
  // don't just get added together as if they were the same unit.
  const personalBreakdown = useMemo(() => {
    const items: SpendItem[] = myExpenses
      .flatMap((e) =>
        e.lineItems.map((li) => ({
          id: li.id,
          vendor: e.vendor,
          category: li.category.name,
          amount: toSgd(li.amount, e.currency, rates),
          originalAmount: li.amount,
          originalCurrency: e.currency,
          date: e.date,
        })),
      )
      .sort((a, b) => b.amount - a.amount);
    const byCategory = new Map<string, number>();
    for (const i of items)
      byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.amount);
    const byDepartment = new Map<string, number>();
    for (const e of myExpenses) {
      const dept = e.department || "Unassigned";
      byDepartment.set(
        dept,
        (byDepartment.get(dept) ?? 0) + toSgd(e.amountTotal, e.currency, rates),
      );
    }
    return {
      items,
      byCategory: [...byCategory.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total),
      byDepartment: [...byDepartment.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total),
    };
  }, [myExpenses, rates]);

  return (
    <div className="page">
      <div className="dash-banner">
        <div>
          <div className="dash-banner-title-row">
            <h1>Expenses</h1>
            <span className="dash-banner-badge">{user?.role}</span>
          </div>
          <div className="dash-banner-sub">
            Welcome, {user?.name} ·{" "}
            {isLead ? "Team & company breakdown" : "Your expense tracking"}
          </div>
        </div>
        <Link to="/expenses/new" className="btn">
          + Add Expense
        </Link>
      </div>

      {isLead && approvalQueueCount !== null && approvalQueueCount > 0 && (
        <div className="callout callout-warn">
          {approvalQueueCount} expense(s) waiting for your approval.{" "}
          <Link to="/expenses?status=PENDING_APPROVAL">Review now →</Link>
        </div>
      )}

      {isLead ? (
        summary && (
          <SpendBreakdown
            title={user?.role === "ADMIN" ? "Company Spend" : "Team Spend"}
            items={summary.items}
            byCategory={summary.byCategory}
            byDepartment={summary.byDepartment}
            onCategoryClick={setActiveCategory}
            activeCategory={activeCategory}
          />
        )
      ) : (
        <SpendBreakdown
          title="My Spend"
          items={personalBreakdown.items}
          byCategory={personalBreakdown.byCategory}
          byDepartment={personalBreakdown.byDepartment}
          currency="SGD"
          onCategoryClick={setActiveCategory}
          activeCategory={activeCategory}
        />
      )}

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
        {summary && (
          <div className="stat-card">
            <div className="stat-value">{summary.flaggedCount}</div>
            <div className="stat-label">Flagged for review</div>
          </div>
        )}
      </section>

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
