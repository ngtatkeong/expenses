import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { Account } from "../../../api/accountingTypes";
import { formatMoney } from "../../../utils/format";
import WizardShell from "./WizardShell";

const STEPS = ["Paste your statement", "Confirm matches"];

interface ReconciliationMatch {
  statementLine: string;
  type: "invoice" | "bill";
  id: string;
  amount: number;
  confidence: "high" | "medium";
  label: string;
}

export default function ReconcileWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [statementText, setStatementText] = useState("");
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [unmatchedLines, setUnmatchedLines] = useState<string[]>([]);
  const [recorded, setRecorded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recordingIdx, setRecordingIdx] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Account[]>("/accounting/accounts")
      .then((all) =>
        setAccounts(
          all.filter((a) => a.type === "ASSET" && !/receivable/i.test(a.name)),
        ),
      );
  }, []);

  async function analyse() {
    setError("");
    setLoading(true);
    try {
      const result = await api.post<{
        matches: ReconciliationMatch[];
        unmatchedLines: string[];
      }>("/ai/reconcile-statement", { statementText });
      setMatches(result.matches);
      setUnmatchedLines(result.unmatchedLines);
      setRecorded(new Set());
      setStep(1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to analyse the statement",
      );
    } finally {
      setLoading(false);
    }
  }

  async function recordMatch(m: ReconciliationMatch, idx: number) {
    setRecordingIdx(idx);
    setError("");
    try {
      await api.post("/accounting/payments", {
        type: m.type === "invoice" ? "RECEIVED" : "PAID",
        date: new Date().toISOString().slice(0, 10),
        amount: m.amount,
        invoiceId: m.type === "invoice" ? m.id : undefined,
        billId: m.type === "bill" ? m.id : undefined,
        bankAccountId,
      });
      setRecorded((prev) => new Set(prev).add(idx));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to record this payment",
      );
    } finally {
      setRecordingIdx(null);
    }
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Bank statement reconciliation"
        intro="Paste the transaction lines from your bank statement (copy from your online banking, one line per transaction). AI will try to match each one to an outstanding invoice or bill."
        stepLabels={STEPS}
        stepIndex={0}
        onNext={analyse}
        nextLabel={loading ? "Analysing…" : "Analyse statement"}
        nextDisabled={loading || !statementText.trim() || !bankAccountId}
        error={error}
      >
        <label className="field" style={{ marginBottom: 12 }}>
          Which bank account is this statement for?
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Statement lines
          <textarea
            rows={10}
            value={statementText}
            onChange={(e) => setStatementText(e.target.value)}
            placeholder={
              "e.g.\n12 Aug  PAYNOW FROM ACME PTE LTD   +2,000.00\n14 Aug  GIRO SP GROUP                -150.00"
            }
          />
        </label>
      </WizardShell>
    );
  }

  const allDone = matches.length > 0 && recorded.size === matches.length;

  return (
    <WizardShell
      title="Confirm matches"
      stepLabels={STEPS}
      stepIndex={1}
      onBack={() => setStep(0)}
      onNext={() => navigate("/accounting")}
      nextLabel={
        allDone ? "Done — back to Accounting home" : "Back to Accounting home"
      }
      error={error}
    >
      {matches.length === 0 && (
        <p className="muted small">No matches found — nothing to confirm.</p>
      )}
      {matches.map((m, idx) => (
        <div
          key={idx}
          className="filters-row"
          style={{
            marginBottom: 10,
            alignItems: "center",
            opacity: recorded.has(idx) ? 0.5 : 1,
          }}
        >
          <div style={{ flex: 1 }}>
            <div className="muted small">{m.statementLine}</div>
            <div>
              {m.type === "invoice" ? "Matches invoice" : "Matches bill"}{" "}
              <strong>{m.label}</strong> — {formatMoney(m.amount)}{" "}
              <span className="muted small">({m.confidence} confidence)</span>
            </div>
          </div>
          <button
            className="btn btn-sm"
            disabled={recorded.has(idx) || recordingIdx === idx}
            onClick={() => recordMatch(m, idx)}
          >
            {recorded.has(idx)
              ? "✓ Recorded"
              : recordingIdx === idx
                ? "Recording…"
                : "Confirm & record"}
          </button>
        </div>
      ))}

      {unmatchedLines.length > 0 && (
        <div className="callout callout-warn" style={{ marginTop: 16 }}>
          <strong>Couldn't match these — record manually if needed:</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {unmatchedLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </WizardShell>
  );
}
