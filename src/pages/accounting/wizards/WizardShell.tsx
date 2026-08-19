import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface WizardShellProps {
  title: string;
  intro?: string;
  stepLabels: string[];
  stepIndex: number;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  error?: string;
  backTo?: string;
}

export default function WizardShell({
  title,
  intro,
  stepLabels,
  stepIndex,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  error,
  backTo = "/accounting",
}: WizardShellProps) {
  return (
    <div className="page">
      <Link to={backTo} className="back-link">
        ← Accounting
      </Link>
      <header className="page-header">
        <h1>{title}</h1>
        {intro && <p className="muted">{intro}</p>}
      </header>

      <div className="wizard-steps">
        {stepLabels.map((label, i) => (
          <span
            key={label}
            className={`wizard-step-pill ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      <section className="panel">
        {children}

        {error && (
          <p className="error-text" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <div className="wizard-nav">
          <button
            className="btn btn-ghost"
            onClick={onBack}
            disabled={!onBack}
            type="button"
          >
            ← Back
          </button>
          <button
            className="btn"
            onClick={onNext}
            disabled={nextDisabled}
            type="button"
          >
            {nextLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
