import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api/client";
import { formatMoney } from "../../../utils/format";
import WizardShell from "./WizardShell";

const STEPS = ["Financial year", "Company details", "Your figures"];

interface IrasSummary {
  from: string;
  to: string;
  revenue: number;
  totalExpenses: number;
  netProfit: number;
  suggestedForm: string;
}

function calendarYear(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export default function IrasWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const now = new Date();

  const [from, setFrom] = useState(calendarYear(now.getFullYear()).from);
  const [to, setTo] = useState(calendarYear(now.getFullYear()).to);
  const [companyName, setCompanyName] = useState("");
  const [uen, setUen] = useState("");
  const [gstRegistered, setGstRegistered] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<IrasSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step !== 2) return;
    setError("");
    api
      .get<IrasSummary>(
        `/accounting/reports/iras-summary?from=${from}&to=${to}`,
      )
      .then(setSummary)
      .catch(() => setError("Couldn't load your figures — try again."));
  }, [step, from, to]);

  function pdfUrl() {
    const params = new URLSearchParams({
      from,
      to,
      companyName,
      uen,
      gstRegistered: String(!!gstRegistered),
    });
    return `/api/accounting/reports/iras-summary.pdf?${params}`;
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Prepare your IRAS tax filing summary"
        intro="Pick the financial year you're filing for. Most companies file once a year, within a few months of their financial year end."
        stepLabels={STEPS}
        stepIndex={0}
        onNext={() => setStep(1)}
        nextDisabled={!from || !to}
      >
        <div className="filters-row" style={{ marginBottom: 10 }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const r = calendarYear(now.getFullYear());
              setFrom(r.from);
              setTo(r.to);
            }}
          >
            This calendar year ({now.getFullYear()})
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const r = calendarYear(now.getFullYear() - 1);
              setFrom(r.from);
              setTo(r.to);
            }}
          >
            Last calendar year ({now.getFullYear() - 1})
          </button>
        </div>
        <div className="filters-row">
          <label className="field">
            Financial year starts
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            Financial year ends
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      </WizardShell>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        title="Company details"
        intro="These go on the summary sheet — they're not saved anywhere, just used for this document."
        stepLabels={STEPS}
        stepIndex={1}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={gstRegistered === null}
      >
        <div className="filters-row" style={{ marginBottom: 16 }}>
          <label className="field" style={{ flex: 1 }}>
            Company name
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="As registered with ACRA"
            />
          </label>
          <label className="field">
            UEN (optional)
            <input
              type="text"
              value={uen}
              onChange={(e) => setUen(e.target.value)}
              placeholder="e.g. 202312345A"
            />
          </label>
        </div>

        <p style={{ marginBottom: 8, fontWeight: 600 }}>
          Is the company GST-registered?
        </p>
        <div className="big-choice-row">
          <button
            className={`big-choice ${gstRegistered === true ? "selected" : ""}`}
            onClick={() => setGstRegistered(true)}
          >
            <div className="big-choice-title">Yes</div>
            <div className="muted small">
              You'll need to also file GST returns separately
            </div>
          </button>
          <button
            className={`big-choice ${gstRegistered === false ? "selected" : ""}`}
            onClick={() => setGstRegistered(false)}
          >
            <div className="big-choice-title">No</div>
            <div className="muted small">
              Most small companies start out here
            </div>
          </button>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      title="Your figures for IRAS"
      stepLabels={STEPS}
      stepIndex={2}
      onBack={() => setStep(1)}
      onNext={() => navigate("/accounting")}
      nextLabel="Done — back to Accounting home"
      error={error}
    >
      {summary && (
        <>
          <p className="muted small">
            Financial year {summary.from} to {summary.to}
          </p>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{formatMoney(summary.revenue)}</div>
              <div className="stat-label">Revenue</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {formatMoney(summary.totalExpenses)}
              </div>
              <div className="stat-label">Total expenses</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatMoney(summary.netProfit)}</div>
              <div className="stat-label">Net profit / (loss)</div>
            </div>
          </div>

          <div className="callout callout-info" style={{ marginBottom: 16 }}>
            Based on your revenue, you'll likely file{" "}
            <strong>{summary.suggestedForm}</strong>. IRAS has other eligibility
            conditions too (like number of shareholders) — this is a starting
            point, not a final answer.
          </div>

          <div className="filters-row" style={{ marginBottom: 16 }}>
            <a className="btn" href={pdfUrl()} target="_blank" rel="noreferrer">
              📄 Download summary (PDF)
            </a>
            <a
              className="btn btn-ghost"
              href="https://mytax.iras.gov.sg"
              target="_blank"
              rel="noreferrer"
            >
              Go to myTax Portal ↗
            </a>
          </div>

          <p className="muted small">
            This is your revenue and profit as recorded in this system — not a
            full tax computation. It doesn't account for disallowable expenses,
            capital allowances, or other tax adjustments. Give the downloaded
            summary to your tax agent, or use it as a starting point on myTax
            Portal yourself.
          </p>
        </>
      )}
    </WizardShell>
  );
}
