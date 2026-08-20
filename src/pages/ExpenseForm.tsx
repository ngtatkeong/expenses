import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { ExpenseCategory, Expense } from "../api/types";
import { useAiEnabled } from "../hooks/useAiEnabled";

interface LineItemDraft {
  categoryId: string;
  amount: string;
  note: string;
}

interface ParsedExpense {
  vendor: string;
  amountTotal: number;
  currency: string;
  date?: string;
  categoryId?: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

export default function ExpenseForm() {
  const navigate = useNavigate();
  const aiEnabled = useAiEnabled();
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

  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const receiptInput = useRef<HTMLInputElement>(null);

  const [policyWarnings, setPolicyWarnings] = useState<string[] | null>(null);
  const [policyChecking, setPolicyChecking] = useState(false);

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

  function applyParsed(parsed: ParsedExpense) {
    setVendor(parsed.vendor);
    setCurrency(parsed.currency || "SGD");
    if (parsed.date) setDate(parsed.date);
    setDescription(parsed.description);
    setLineItems([
      {
        categoryId: parsed.categoryId || categories[0]?.id || "",
        amount: String(parsed.amountTotal),
        note: "",
      },
    ]);
    setPolicyWarnings(null);
  }

  async function fillFromText() {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiError("");
    try {
      const parsed = await api.post<ParsedExpense>("/ai/parse-expense-text", {
        text: aiText,
      });
      applyParsed(parsed);
    } catch (err) {
      setAiError(
        err instanceof ApiError
          ? err.message
          : "Couldn't read that — try filling the form manually",
      );
    } finally {
      setAiBusy(false);
    }
  }

  async function fillFromReceipt(file: File) {
    setOcrBusy(true);
    setOcrProgress(0);
    setAiError("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text")
            setOcrProgress(Math.round(m.progress * 100));
        },
      });
      const {
        data: { text },
      } = await worker.recognize(file);
      await worker.terminate();
      if (!text.trim())
        throw new Error("Couldn't read any text from that image");
      const parsed = await api.post<ParsedExpense>("/ai/parse-expense-text", {
        text,
      });
      applyParsed(parsed);
    } catch (err) {
      setAiError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't read that receipt — try filling the form manually",
      );
    } finally {
      setOcrBusy(false);
      if (receiptInput.current) receiptInput.current.value = "";
    }
  }

  async function save(submit: boolean) {
    setError("");

    if (submit && aiEnabled && policyWarnings === null) {
      const firstLine = lineItems.find(
        (li) => li.categoryId && Number(li.amount) > 0,
      );
      if (firstLine) {
        setPolicyChecking(true);
        try {
          const result = await api.post<{ warnings: string[] }>(
            "/ai/expense-policy-check",
            {
              vendor,
              amountTotal: total,
              currency,
              categoryId: firstLine.categoryId,
              date,
            },
          );
          setPolicyChecking(false);
          if (result.warnings.length > 0) {
            setPolicyWarnings(result.warnings);
            return; // let the user see warnings and confirm before actually submitting
          }
        } catch {
          setPolicyChecking(false);
          // If the check itself fails, don't block submission on it.
        }
      }
    }

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

      {aiEnabled && (
        <section className="panel">
          <h2>✨ Fill this in for me</h2>
          <div className="filters-row">
            <input
              type="text"
              placeholder='e.g. "lunch with client at Din Tai Fung, $45 yesterday"'
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              style={{ flex: 1, minWidth: 260 }}
            />
            <button
              className="btn btn-sm"
              onClick={fillFromText}
              disabled={aiBusy || !aiText.trim()}
            >
              {aiBusy ? "Reading…" : "Fill from description"}
            </button>
            <label className="btn btn-sm btn-ghost">
              {ocrBusy
                ? `Reading receipt… ${ocrProgress}%`
                : "📷 Fill from receipt photo"}
              <input
                ref={receiptInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={ocrBusy}
                onChange={(e) =>
                  e.target.files?.[0] && fillFromReceipt(e.target.files[0])
                }
              />
            </label>
          </div>
          {aiError && <p className="error-text small">{aiError}</p>}
        </section>
      )}

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

      {policyWarnings && policyWarnings.length > 0 && (
        <div className="callout callout-warn">
          <strong>Before you submit, worth a look:</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {policyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 8 }}>
            Click "Submit for Approval" again to submit anyway.
          </p>
        </div>
      )}

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
          disabled={busy || policyChecking || !vendor || total <= 0}
          onClick={() => save(true)}
        >
          {policyChecking ? "Checking…" : "Submit for Approval"}
        </button>
      </div>
      <p className="muted small">
        You can attach receipts after saving. Drafts can be edited any time
        before submitting.
      </p>
    </div>
  );
}
