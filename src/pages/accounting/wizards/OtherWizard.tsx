import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { Account } from "../../../api/accountingTypes";
import { formatMoney } from "../../../utils/format";
import { useAiEnabled } from "../../../hooks/useAiEnabled";
import WizardShell from "./WizardShell";

const STEPS = ["What happened?", "Which accounts?", "Review & confirm"];

interface ParsedOtherTransaction {
  description: string;
  amount: number;
  toAccountId?: string;
  fromAccountId?: string;
}

export default function OtherWizard() {
  const navigate = useNavigate();
  const aiEnabled = useAiEnabled();
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [toAccountId, setToAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiFilled, setAiFilled] = useState(false);

  useEffect(() => {
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }, []);

  async function fillFromText() {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiError("");
    try {
      const parsed = await api.post<ParsedOtherTransaction>(
        "/ai/parse-other-transaction-text",
        { text: aiText },
      );
      setDescription(parsed.description);
      setAmount(String(parsed.amount));
      if (parsed.toAccountId) setToAccountId(parsed.toAccountId);
      if (parsed.fromAccountId) setFromAccountId(parsed.fromAccountId);
      setAiFilled(true);
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

  async function submit() {
    setError("");
    if (toAccountId === fromAccountId) {
      setError("Pick two different accounts");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/accounting/journal-entries", {
        date,
        memo: description,
        lines: [
          { accountId: toAccountId, debit: Number(amount) },
          { accountId: fromAccountId, credit: Number(amount) },
        ],
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record this");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <WizardShell
        title="Recorded"
        stepLabels={STEPS}
        stepIndex={2}
        onNext={() => navigate("/accounting")}
        nextLabel="Back to Accounting home"
      >
        <div className="callout callout-info">
          {formatMoney(Number(amount))} has been recorded.
        </div>
      </WizardShell>
    );
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Record something else"
        intro="For anything that isn't a sale, a purchase, or a bank payment against one of those — e.g. the owner putting in capital, moving cash between two accounts, or a bank fee."
        stepLabels={STEPS}
        stepIndex={0}
        onNext={() => setStep(1)}
        nextDisabled={!description.trim() || !Number(amount)}
      >
        {aiEnabled && (
          <div className="filters-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder='✨ Or just describe it: "owner put in $5,000 cash as capital"'
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
          </div>
        )}
        {aiError && <p className="error-text small">{aiError}</p>}
        {aiFilled && (
          <p className="muted small" style={{ marginBottom: 8 }}>
            Filled in below — check it, then continue. (Accounts on the next
            step too, if AI could tell.)
          </p>
        )}
        <div className="filters-row">
          <label className="field" style={{ flex: 1 }}>
            What happened?
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Owner put in starting capital"
            />
          </label>
          <label className="field">
            Amount
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: 140 }}
            />
          </label>
          <label className="field">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      </WizardShell>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        title="Which accounts does this affect?"
        intro="Every transaction moves money from one place to another — even if one side is just a category rather than a real account."
        stepLabels={STEPS}
        stepIndex={1}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={
          !toAccountId || !fromAccountId || toAccountId === fromAccountId
        }
        error={error}
      >
        <div className="filters-row">
          <label className="field" style={{ flex: 1 }}>
            Money went INTO
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
            >
              <option value="">Select…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            Money came OUT OF
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
            >
              <option value="">Select…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Example: owner puts in $5,000 cash → money went INTO "Bank Account",
          and came OUT OF "Share Capital".
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
      nextLabel={submitting ? "Recording…" : "Confirm & record"}
      nextDisabled={submitting}
      error={error}
    >
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>{description}</li>
        <li>
          Amount: <strong>{formatMoney(Number(amount) || 0)}</strong>
        </li>
        <li>Into: {accounts.find((a) => a.id === toAccountId)?.name}</li>
        <li>Out of: {accounts.find((a) => a.id === fromAccountId)?.name}</li>
      </ul>
    </WizardShell>
  );
}
