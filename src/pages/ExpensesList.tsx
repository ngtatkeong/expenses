import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Expense } from "../api/types";
import StatusBadge from "../components/StatusBadge";
import { formatMoney, formatDate } from "../utils/format";

const STATUS_OPTIONS = [
  "DRAFT",
  "PENDING_APPROVAL",
  "INFO_REQUESTED",
  "APPROVED",
  "REJECTED",
  "PAID",
];

export default function ExpensesList() {
  const [params, setParams] = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const status = params.get("status") ?? "";

  useEffect(() => {
    setLoading(true);
    const qs = status ? `?status=${status}` : "";
    api
      .get<Expense[]>(`/expenses${qs}`)
      .then(setExpenses)
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Expenses</h1>
        <Link to="/expenses/new" className="btn">
          + New Expense
        </Link>
      </header>

      <div className="filters-row">
        <select
          value={status}
          onChange={(e) =>
            setParams(e.target.value ? { status: e.target.value } : {})
          }
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <section className="panel">
        {loading ? (
          <p className="muted small">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="muted small">No expenses found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Submitted By</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr
                  key={e.id}
                  className="clickable"
                  onClick={() => navigate(`/expenses/${e.id}`)}
                >
                  <td>{formatDate(e.date)}</td>
                  <td>{e.vendor}</td>
                  <td>{e.submittedBy.name}</td>
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
