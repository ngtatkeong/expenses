import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { Account, Vendor } from "../../../api/accountingTypes";
import { formatMoney } from "../../../utils/format";
import { useAiEnabled } from "../../../hooks/useAiEnabled";
import WizardShell from "./WizardShell";

interface ParsedTransaction {
  partyName: string;
  existingPartyId?: string;
  description: string;
  amount: number;
  accountId?: string;
}

const STEPS = ["Who did you pay?", "What was it for?", "Review & confirm"];

function findPayableAccount(accounts: Account[]) {
  return (
    accounts.find((a) => a.code === "2000") ??
    accounts.find((a) => a.type === "LIABILITY" && /payable/i.test(a.name)) ??
    null
  );
}

interface DraftLine {
  description: string;
  amount: string;
  accountId: string;
}

export default function ExpenseWizard() {
  const navigate = useNavigate();
  const aiEnabled = useAiEnabled();
  const [step, setStep] = useState(0);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", amount: "", accountId: "" },
  ]);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiFilled, setAiFilled] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const receiptInput = useRef<HTMLInputElement>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function load() {
    api.get<Vendor[]>("/accounting/vendors").then(setVendors);
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  const expenseAccounts = accounts.filter(
    (a) => a.type === "EXPENSE" || a.type === "ASSET",
  );
  const payableAccount = findPayableAccount(accounts);
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      { description: "", amount: "", accountId: prev[0]?.accountId ?? "" },
    ]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function applyParsed(parsed: ParsedTransaction) {
    if (parsed.existingPartyId) {
      setVendorId(parsed.existingPartyId);
      setNewVendorName("");
    } else {
      setVendorId("");
      setNewVendorName(parsed.partyName);
    }
    setLines([
      {
        description: parsed.description,
        amount: String(parsed.amount),
        accountId: parsed.accountId || "",
      },
    ]);
    setAiFilled(true);
  }

  async function fillFromText() {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiError("");
    try {
      const parsed = await api.post<ParsedTransaction>(
        "/ai/parse-transaction-text",
        {
          text: aiText,
          kind: "expense",
        },
      );
      applyParsed(parsed);
    } catch (err) {
      setAiError(
        err instanceof ApiError
          ? err.message
          : "Couldn't read that — try filling it in manually",
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
      const parsed = await api.post<ParsedTransaction>(
        "/ai/parse-transaction-text",
        {
          text,
          kind: "expense",
        },
      );
      applyParsed(parsed);
    } catch (err) {
      setAiError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't read that receipt — try filling it in manually",
      );
    } finally {
      setOcrBusy(false);
      if (receiptInput.current) receiptInput.current.value = "";
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    setError("");
    try {
      const nextCode = String(
        (Math.max(0, ...accounts.map((a) => Number(a.code) || 0)) || 6000) + 1,
      );
      const acc = await api.post<Account>("/accounting/accounts", {
        code: nextCode,
        name: newCategoryName.trim(),
        type: "EXPENSE",
      });
      setAccounts((prev) => [...prev, acc]);
      setNewCategoryName("");
      if (lines.length && !lines[0].accountId)
        updateLine(0, { accountId: acc.id });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to add category",
      );
    }
  }

  async function submit() {
    setError("");
    if (!payableAccount) {
      setError(
        "No 'Accounts Payable' category found — set up categories first.",
      );
      return;
    }
    setSubmitting(true);
    try {
      let vId = vendorId;
      if (!vId) {
        if (!newVendorName.trim()) throw new Error("Enter who you paid");
        const v = await api.post<Vendor>("/accounting/vendors", {
          name: newVendorName.trim(),
        });
        vId = v.id;
      }
      const payloadLines = lines
        .filter((l) => l.description && l.accountId && Number(l.amount))
        .map((l) => ({
          description: l.description,
          quantity: 1,
          unitPrice: Number(l.amount),
          accountId: l.accountId,
        }));
      if (payloadLines.length === 0)
        throw new Error("Add at least one expense item");

      const billNumber = `BILL-${Date.now().toString().slice(-6)}`;
      await api.post("/accounting/bills", {
        billNumber,
        vendorId: vId,
        issueDate,
        dueDate,
        payableAccountId: payableAccount.id,
        lines: payloadLines,
      });
      setDone(billNumber);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to record expense",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <WizardShell
        title="Expense recorded"
        stepLabels={STEPS}
        stepIndex={2}
        onNext={() => navigate("/accounting")}
        nextLabel="Back to Accounting home"
      >
        <div className="callout callout-info">
          Bill <strong>{done}</strong> for {formatMoney(total)} has been
          recorded.
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Once you actually pay it, come back and use{" "}
          <strong>"Record money in or out of the bank"</strong> to match the
          payment to this bill.
        </p>
      </WizardShell>
    );
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Record a purchase or expense"
        intro="Who did you pay, or who do you owe money to? If they're not in the list yet, just type their name and we'll add them."
        stepLabels={STEPS}
        stepIndex={0}
        onNext={() => setStep(1)}
        nextDisabled={!vendorId && !newVendorName.trim()}
      >
        {aiEnabled && (
          <div className="filters-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder='✨ Or just describe it: "paid $150 to SP Group for electricity"'
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-sm"
              onClick={fillFromText}
              disabled={aiBusy || !aiText.trim()}
            >
              {aiBusy ? "Reading…" : "Fill this in"}
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
        )}
        {aiError && <p className="error-text small">{aiError}</p>}
        {aiFilled && (
          <p className="muted small" style={{ marginBottom: 8 }}>
            Vendor and item filled in below — check them, then continue.
          </p>
        )}
        <div className="filters-row">
          <label className="field" style={{ flex: 1 }}>
            Vendor / supplier
            <select
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setNewVendorName("");
              }}
            >
              <option value="">— New vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {!vendorId && (
            <label className="field" style={{ flex: 1 }}>
              New vendor's name
              <input
                type="text"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                placeholder="e.g. SP Group, or a supplier's name"
              />
            </label>
          )}
        </div>
      </WizardShell>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        title="What was it for?"
        intro="List what you bought and which expense category it belongs to."
        stepLabels={STEPS}
        stepIndex={1}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={
          !lines.some((l) => l.description && l.accountId && Number(l.amount))
        }
        error={error}
      >
        {expenseAccounts.length === 0 && (
          <div className="callout callout-warn" style={{ marginBottom: 12 }}>
            You don't have an expense category yet — add one below (e.g. "Office
            Supplies").
          </div>
        )}
        <div className="filters-row" style={{ marginBottom: 10 }}>
          <input
            type="text"
            placeholder="New expense category, e.g. Office Supplies"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm btn-ghost" onClick={addCategory}>
            + Add category
          </button>
        </div>

        {lines.map((l, i) => (
          <div className="filters-row" key={i} style={{ marginBottom: 8 }}>
            <input
              type="text"
              placeholder="What was bought"
              value={l.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              style={{ flex: 2 }}
            />
            <input
              type="number"
              placeholder="Amount (SGD)"
              value={l.amount}
              onChange={(e) => updateLine(i, { amount: e.target.value })}
              style={{ width: 130 }}
            />
            <select
              value={l.accountId}
              onChange={(e) => updateLine(i, { accountId: e.target.value })}
              style={{ flex: 1 }}
            >
              <option value="">Expense category…</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {lines.length > 1 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => removeLine(i)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={addLine}>
          + Add another item
        </button>
        <p style={{ marginTop: 10 }}>
          <strong>Total: {formatMoney(total)}</strong>
        </p>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      title="Review & confirm"
      stepLabels={STEPS}
      stepIndex={2}
      onBack={() => setStep(1)}
      onNext={submit}
      nextLabel={submitting ? "Recording…" : "Confirm & record expense"}
      nextDisabled={submitting}
      error={error}
    >
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          Paid to:{" "}
          <strong>
            {vendorId
              ? vendors.find((v) => v.id === vendorId)?.name
              : newVendorName}
          </strong>
        </li>
        {lines
          .filter((l) => l.description)
          .map((l, i) => (
            <li key={i}>
              {l.description} — {formatMoney(Number(l.amount) || 0)}
            </li>
          ))}
        <li>
          Total: <strong>{formatMoney(total)}</strong>
        </li>
      </ul>
      <div className="filters-row" style={{ marginTop: 12 }}>
        <label className="field">
          Purchase date
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </label>
        <label className="field">
          Payment due by
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
      </div>
    </WizardShell>
  );
}
