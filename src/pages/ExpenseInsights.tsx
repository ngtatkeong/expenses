import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { ExpenseInsights as ExpenseInsightsData } from "../api/aiTypes";
import { useAiEnabled } from "../hooks/useAiEnabled";
import { formatMoney } from "../utils/format";

export default function ExpenseInsights() {
  const aiEnabled = useAiEnabled();
  const [fiscalYear, setFiscalYear] = useState("");
  const [insights, setInsights] = useState<ExpenseInsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setInsights(null);
    try {
      const data = await api.post<ExpenseInsightsData>("/ai/expense-insights", {
        fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      });
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
      <header className="page-header">
        <h1>AI Insights</h1>
        <p className="muted">
          Ask AI to look at your expense records and point out spending
          patterns, likely duplicates, and unusually large expenses — grounded
          only in your actual data, nothing invented.
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
            <div className="filters-row">
              <label className="field">
                Fiscal year
                <input
                  type="number"
                  placeholder="All years"
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(e.target.value)}
                  style={{ width: 140 }}
                />
              </label>
              <button
                className="btn"
                onClick={generate}
                disabled={loading}
                style={{ alignSelf: "flex-end" }}
              >
                {loading ? "Analysing…" : "✨ Generate insights"}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </section>

          {insights && (
            <section className="panel">
              {insights.expenseCount === 0 ? (
                <p className="muted small">{insights.summary}</p>
              ) : (
                <>
                  <div className="grid-2" style={{ marginBottom: 16 }}>
                    <div className="stat-card">
                      <div className="stat-value">{insights.expenseCount}</div>
                      <div className="stat-label">Expenses analysed</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">
                        {formatMoney(insights.totalSgd)}
                      </div>
                      <div className="stat-label">Total (SGD)</div>
                    </div>
                  </div>

                  <p>{insights.summary}</p>

                  {insights.highlights.length > 0 && (
                    <>
                      <h3 style={{ marginTop: 16 }}>Spending patterns</h3>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {insights.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {insights.anomalies.length > 0 && (
                    <div
                      className="callout callout-warn"
                      style={{ marginTop: 16 }}
                    >
                      <strong>Worth a second look:</strong>
                      <ul style={{ margin: "6px 0 0 18px" }}>
                        {insights.anomalies.map((a, i) => (
                          <li key={i}>{a}</li>
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
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
