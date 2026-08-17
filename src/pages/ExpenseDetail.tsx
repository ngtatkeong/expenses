import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../store/AuthContext";
import type { Expense, ExpenseCategory, ExchangeRate } from "../api/types";
import { toSgd } from "../utils/currency";
import StatusBadge from "../components/StatusBadge";
import {
  formatMoney,
  formatDate,
  formatDateTime,
  ACTION_LABELS,
} from "../utils/format";

export default function ExpenseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<Expense>(`/expenses/${id}`)
      .then(setExpense)
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Failed to load expense",
        ),
      );
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    if (user?.role === "ADMIN") {
      api.get<ExpenseCategory[]>("/categories").then(setCategories);
    }
  }, [user?.role]);
  useEffect(() => {
    api.get<ExchangeRate[]>("/exchange-rates").then(setRates);
  }, []);

  async function recategorize(lineItemId: string, categoryId: string) {
    setError("");
    try {
      const updated = await api.patch<Expense>(
        `/expenses/${id}/line-items/${lineItemId}/category`,
        { categoryId },
      );
      setExpense(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to recategorize",
      );
      load(); // re-sync the dropdown back to the real server state
    }
  }

  if (error)
    return (
      <div className="page">
        <p className="error-text">{error}</p>
      </div>
    );
  if (!expense)
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );

  const isOwner = expense.submittedById === user?.id;
  const isApprover =
    user?.role === "ADMIN" ||
    (user?.role === "MANAGER" &&
      (expense.currentApproverId === user.id ||
        expense.currentApproverId === null));
  const canEdit =
    isOwner &&
    ["DRAFT", "INFO_REQUESTED"].includes(expense.status) &&
    !expense.locked;
  const canAct = isApprover && expense.status === "PENDING_APPROVAL";
  const canPay =
    user?.role === "ADMIN" && expense.status === "APPROVED" && !expense.locked;
  const canUploadReceipt =
    (isOwner || user?.role === "ADMIN") && !expense.locked;

  async function runAction(path: string, needsComment = false) {
    if (needsComment && !comment.trim()) {
      setError("Please add a comment first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(`/expenses/${id}/${path}`, {
        comment: comment || undefined,
      });
      setComment("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/expenses/${id}`, { submit: true });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/receipts/expense/${id}`, form);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeReceipt(receiptId: string) {
    if (!confirm("Remove this receipt?")) return;
    await api.delete(`/receipts/${receiptId}`);
    load();
  }

  async function deleteDraft() {
    if (!confirm("Delete this draft expense? This cannot be undone.")) return;
    await api.delete(`/expenses/${id}`);
    navigate("/expenses");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{expense.vendor}</h1>
          <p className="muted">
            {formatDate(expense.date)} · Submitted by {expense.submittedBy.name}
            {expense.department ? ` · ${expense.department}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={expense.status} />
          {expense.flagged && (
            <span className="badge badge-flagged">Flagged</span>
          )}
          {expense.locked && (
            <span className="badge badge-role">FY Locked</span>
          )}
        </div>
      </header>

      {expense.flagged && expense.flagReason && (
        <div className="callout callout-warn">⚠ {expense.flagReason}</div>
      )}
      {error && <p className="error-text">{error}</p>}

      <section className="panel">
        <h2>Line items</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {expense.lineItems.map((li) => (
              <tr key={li.id}>
                <td>
                  {user?.role === "ADMIN" && !expense.locked ? (
                    <select
                      value={li.category.id}
                      onChange={(e) => recategorize(li.id, e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    li.category.name
                  )}
                </td>
                <td>{formatMoney(li.amount, expense.currency)}</td>
                <td className="muted">{li.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 10, fontWeight: 700 }}>
          Total: {formatMoney(expense.amountTotal, expense.currency)}
          {expense.currency !== "SGD" && (
            <span className="muted" style={{ fontWeight: 400 }}>
              {" "}
              — ≈{" "}
              {formatMoney(
                toSgd(expense.amountTotal, expense.currency, rates),
                "SGD",
              )}{" "}
              paid to staff
            </span>
          )}
        </p>
        {expense.description && (
          <p className="muted small">{expense.description}</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Receipts</h2>
          {canUploadReceipt && (
            <label className="btn btn-sm btn-ghost">
              + Upload receipt
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                style={{ display: "none" }}
                onChange={(e) =>
                  e.target.files?.[0] && uploadReceipt(e.target.files[0])
                }
              />
            </label>
          )}
        </div>
        {expense.receipts.length === 0 ? (
          <p className="muted small">No receipts attached.</p>
        ) : (
          <div className="receipt-list">
            {expense.receipts.map((r) => (
              <div key={r.id} className="receipt-chip">
                <a
                  href={`/api/receipts/${r.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {r.originalName}
                </a>
                <span className="muted">
                  ({Math.round(r.sizeBytes / 1024)} KB)
                </span>
                {canUploadReceipt && (
                  <button
                    className="btn-ghost"
                    style={{ border: "none", cursor: "pointer" }}
                    onClick={() => removeReceipt(r.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {(canAct || canPay) && (
        <section className="panel">
          <h2>Take action</h2>
          <label className="field full-width" style={{ marginBottom: 10 }}>
            Comment (required to reject or request info)
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canAct && (
              <>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => runAction("approve")}
                >
                  Approve
                </button>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => runAction("reject", true)}
                >
                  Reject
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => runAction("request-info", true)}
                >
                  Request More Info
                </button>
              </>
            )}
            {canPay && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => runAction("pay")}
              >
                Mark as Paid
              </button>
            )}
          </div>
        </section>
      )}

      {canEdit && (
        <section className="panel">
          <h2>Your options</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {expense.status === "DRAFT" && (
              <>
                <button className="btn" disabled={busy} onClick={submitDraft}>
                  Submit for Approval
                </button>
                <button
                  className="btn btn-danger btn-ghost"
                  disabled={busy}
                  onClick={deleteDraft}
                >
                  Delete Draft
                </button>
              </>
            )}
            {expense.status === "INFO_REQUESTED" && (
              <button className="btn" disabled={busy} onClick={submitDraft}>
                Resubmit for Approval
              </button>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>History</h2>
        <div className="approval-timeline">
          {expense.auditLogs.map((a) => (
            <div key={a.id} className="approval-timeline-item">
              <span className="action-label">
                {ACTION_LABELS[a.action] ?? a.action}
              </span>{" "}
              by {a.actor.name}
              <div className="muted small">{formatDateTime(a.createdAt)}</div>
              {a.comment && <div className="small">"{a.comment}"</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
