import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { Account, Customer } from "../../../api/accountingTypes";
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

const STEPS = [
  "Who bought from you?",
  "What did they buy?",
  "Review & confirm",
];

function findReceivableAccount(accounts: Account[]) {
  return (
    accounts.find((a) => a.code === "1200") ??
    accounts.find((a) => a.type === "ASSET" && /receivable/i.test(a.name)) ??
    null
  );
}

interface DraftLine {
  description: string;
  amount: string;
  accountId: string;
}

export default function SaleWizard() {
  const navigate = useNavigate();
  const aiEnabled = useAiEnabled();
  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
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
    api.get<Customer[]>("/accounting/customers").then(setCustomers);
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");
  const receivableAccount = findReceivableAccount(accounts);
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
      setCustomerId(parsed.existingPartyId);
      setNewCustomerName("");
    } else {
      setCustomerId("");
      setNewCustomerName(parsed.partyName);
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
          kind: "sale",
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
          kind: "sale",
        },
      );
      applyParsed(parsed);
    } catch (err) {
      setAiError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Couldn't read that photo — try filling it in manually",
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
        (Math.max(0, ...accounts.map((a) => Number(a.code) || 0)) || 4000) + 1,
      );
      const acc = await api.post<Account>("/accounting/accounts", {
        code: nextCode,
        name: newCategoryName.trim(),
        type: "INCOME",
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
    if (!receivableAccount) {
      setError(
        "No 'Accounts Receivable' category found — set up categories first.",
      );
      return;
    }
    setSubmitting(true);
    try {
      let custId = customerId;
      if (!custId) {
        if (!newCustomerName.trim())
          throw new Error("Enter the customer's name");
        const c = await api.post<Customer>("/accounting/customers", {
          name: newCustomerName.trim(),
        });
        custId = c.id;
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
        throw new Error("Add at least one item sold");

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      await api.post("/accounting/invoices", {
        invoiceNumber,
        customerId: custId,
        issueDate,
        dueDate,
        receivableAccountId: receivableAccount.id,
        lines: payloadLines,
      });
      setDone(invoiceNumber);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to record sale",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <WizardShell
        title="Sale recorded"
        stepLabels={STEPS}
        stepIndex={2}
        onNext={() => navigate("/accounting")}
        nextLabel="Back to Accounting home"
      >
        <div className="callout callout-info">
          Invoice <strong>{done}</strong> for {formatMoney(total)} has been
          recorded.
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Once the customer actually pays you, come back and use{" "}
          <strong>"Record money in or out of the bank"</strong> to match the
          payment to this invoice.
        </p>
      </WizardShell>
    );
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Record a sale"
        intro="Who bought from you? If they're not in the list yet, just type their name and we'll add them."
        stepLabels={STEPS}
        stepIndex={0}
        onNext={() => setStep(1)}
        nextDisabled={!customerId && !newCustomerName.trim()}
      >
        {aiEnabled && (
          <div className="filters-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder='✨ Or just describe it: "received $2,000 from Acme for consulting"'
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
                ? `Reading photo… ${ocrProgress}%`
                : "📷 Fill from a photo"}
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
            Customer and item filled in below — check them, then continue.
          </p>
        )}
        <div className="filters-row">
          <label className="field" style={{ flex: 1 }}>
            Customer
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setNewCustomerName("");
              }}
            >
              <option value="">— New customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!customerId && (
            <label className="field" style={{ flex: 1 }}>
              New customer's name
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="e.g. Acme Pte Ltd"
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
        title="What did they buy?"
        intro='List what you sold and which income category it belongs to. Most small businesses only need one category, like "Sales Revenue".'
        stepLabels={STEPS}
        stepIndex={1}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={
          !lines.some((l) => l.description && l.accountId && Number(l.amount))
        }
        error={error}
      >
        {incomeAccounts.length === 0 && (
          <div className="callout callout-warn" style={{ marginBottom: 12 }}>
            You don't have an income category yet — add one below (e.g. "Sales
            Revenue").
          </div>
        )}
        <div className="filters-row" style={{ marginBottom: 10 }}>
          <input
            type="text"
            placeholder="New income category, e.g. Sales Revenue"
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
              placeholder="What was sold"
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
              <option value="">Income category…</option>
              {incomeAccounts.map((a) => (
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
      nextLabel={submitting ? "Recording…" : "Confirm & record sale"}
      nextDisabled={submitting}
      error={error}
    >
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          Customer:{" "}
          <strong>
            {customerId
              ? customers.find((c) => c.id === customerId)?.name
              : newCustomerName}
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
          Sale date
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
