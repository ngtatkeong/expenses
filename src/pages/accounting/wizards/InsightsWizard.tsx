import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { AccountingInsights } from "../../../api/aiTypes";
import { useAiEnabled } from "../../../hooks/useAiEnabled";
import { formatMoney } from "../../../utils/format";

export default function InsightsWizard() {
  const aiEnabled = useAiEnabled();
  const [insights, setInsights] = useState<AccountingInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setInsights(null);
    try {
      const data = await api.post<AccountingInsights>(
        "/ai/accounting-insights",
      );
      setInsights(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to generate insights",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <Link to="/accounting" className="back-link">
        ← Accounting
      </Link>
      <header className="page-header">
        <h1>AI Insights</h1>
        <p className="muted">
          A plain-English look at your finances — money owed to you, money you
          owe, and anything worth paying attention to. Grounded only in your
          actual records, in plain English, no jargon.
        </p>
      </header>

      {!aiEnabled ? (
        <section className="panel">
          <p className="muted small">
            AI insights aren't configured on this server yet.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <button className="btn" onClick={generate} disabled={loading}>
              {loading ? "Thinking…" : "✨ Get insights"}
            </button>
            {error && (
              <p className="error-text" style={{ marginTop: 8 }}>
                {error}
              </p>
            )}
          </section>

          {insights && (
            <section className="panel">
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="stat-card">
                  <div className="stat-value">
                    {formatMoney(insights.totalOwedToYou)}
                  </div>
                  <div className="stat-label">Owed to you right now</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {formatMoney(insights.totalYouOwe)}
                  </div>
                  <div className="stat-label">You owe right now</div>
                </div>
              </div>

              <p>{insights.summary}</p>

              {insights.highlights.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>What's happening</h3>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {insights.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </>
              )}

              {insights.risks.length > 0 && (
                <div className="callout callout-warn" style={{ marginTop: 16 }}>
                  <strong>Worth watching:</strong>
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    {insights.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.suggestions.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>Suggestions</h3>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {insights.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
