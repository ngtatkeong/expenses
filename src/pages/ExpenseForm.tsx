import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { ExpenseCategory, Expense } from "../api/types";

interface LineItemDraft {
  categoryId: string;
  amount: string;
  note: string;
}

export default function ExpenseForm() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState("");
  const [currency, setCurrency] = useState("SGD");
  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([
    { categoryId: "", amount: "", note: "" },
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<ExpenseCategory[]>("/categories").then((cats) => {
      setCategories(cats);
      setLineItems((prev) =>
        prev[0].categoryId
          ? prev
          : [{ ...prev[0], categoryId: cats[0]?.id ?? "" }],
      );
    });
  }, []);

  const total = lineItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  function updateLine(i: number, patch: Partial<LineItemDraft>) {
    setLineItems((prev) =>
      prev.map((li, idx) => (idx === i ? { ...li, ...patch } : li)),
    );
  }

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      { categoryId: categories[0]?.id ?? "", amount: "", note: "" },
    ]);
  }

  function removeLine(i: number) {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save(submit: boolean) {
    setError("");
    setBusy(true);
    try {
      const payload = {
        date,
        vendor,
        currency,
        description,
        submit,
        lineItems: lineItems
          .filter((li) => li.categoryId && Number(li.amount) > 0)
          .map((li) => ({
            categoryId: li.categoryId,
            amount: Number(li.amount),
            note: li.note || undefined,
          })),
      };
      const expense = await api.post<Expense>("/expenses", payload);
      navigate(`/expenses/${expense.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to save expense",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>New Expense</h1>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label>
            Vendor
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Grab, Marina Bay Hotel"
              required
            />
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {["SGD", "USD", "MYR", "EUR", "GBP", "JPY", "CNY", "AUD"].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="full-width">
            Description
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this for?"
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Categories</h2>
          <span className="muted small">
            Split this expense across categories if needed
          </span>
        </div>
        <div className="line-items">
          {lineItems.map((li, i) => (
            <div key={i} className="line-item-row">
              <select
                value={li.categoryId}
                onChange={(e) => updateLine(i, { categoryId: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.spendingLimitPerExpense != null
                      ? ` (limit ${c.spendingLimitPerExpense})`
                      : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={li.amount}
                onChange={(e) => updateLine(i, { amount: e.target.value })}
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={li.note}
                onChange={(e) => updateLine(i, { note: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => removeLine(i)}
                disabled={lineItems.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={addLine}
          style={{ marginTop: 10 }}
        >
          + Add another category
        </button>
        <p style={{ marginTop: 14, fontWeight: 700 }}>
          Total: {total.toFixed(2)} {currency}
        </p>
      </section>

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => save(false)}
        >
          Save as Draft
        </button>
        <button
          className="btn"
          disabled={busy || !vendor || total <= 0}
          onClick={() => save(true)}
        >
          Submit for Approval
        </button>
      </div>
      <p className="muted small">
        You can attach receipts after saving. Drafts can be edited any time
        before submitting.
      </p>
    </div>
  );
}
