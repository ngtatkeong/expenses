import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Settings } from "../api/types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Settings>("/settings").then(setSettings);
  }, []);

  async function save(patch: Partial<Settings>) {
    const updated = await api.put<Settings>("/settings", patch);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!settings)
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );

  return (
    <div className="page">
      <header className="page-header">
        <h1>System Settings</h1>
        {saved && <span className="badge badge-approved">Saved</span>}
      </header>

      <section className="panel">
        <h2>Approval Workflow</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          When enabled, submitted expenses go to the submitter's manager for
          review before reaching Finance. When disabled, all submissions go
          straight to Approved, ready for payment — manager review is bypassed
          entirely.
        </p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.approvalWorkflowEnabled}
            onChange={(e) =>
              save({ approvalWorkflowEnabled: e.target.checked })
            }
          />
          Require manager approval before an expense reaches Finance
        </label>
      </section>

      <section className="panel">
        <h2>Defaults & Policy</h2>
        <div className="form-grid">
          <label>
            Default currency
            <select
              value={settings.defaultCurrency}
              onChange={(e) => save({ defaultCurrency: e.target.value })}
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
          <label>
            Fiscal year start month
            <select
              value={settings.fiscalYearStartMonth}
              onChange={(e) =>
                save({ fiscalYearStartMonth: Number(e.target.value) })
              }
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Flag missing receipts above
            <input
              type="number"
              defaultValue={settings.receiptRequiredAbove}
              onBlur={(e) =>
                save({ receiptRequiredAbove: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </section>
    </div>
  );
}
