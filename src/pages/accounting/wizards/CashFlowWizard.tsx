import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import { formatMoney } from "../../../utils/format";

interface Period {
  label: string;
  expectedIn: number;
  expectedOut: number;
  projectedCash: number;
}

interface Forecast {
  currentCashSgd: number;
  periods: Period[];
  narrative: string;
}

export default function CashFlowWizard() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Forecast>("/ai/cash-flow-forecast")
      .then(setForecast)
      .catch(() => setError("Couldn't load the forecast — try again later."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <Link to="/accounting" className="back-link">
        ← Accounting
      </Link>
      <header className="page-header">
        <h1>Cash Flow Forecast</h1>
        <p className="muted">
          Where your cash is headed over the next 90 days, based on what's
          already been recorded — outstanding invoices coming in, bills going
          out.
        </p>
      </header>

      {loading && <p className="muted">✨ Calculating…</p>}
      {error && <p className="error-text">{error}</p>}

      {forecast && (
        <>
          <section className="panel">
            <div className="stat-card" style={{ marginBottom: 16 }}>
              <div className="stat-value">
                {formatMoney(forecast.currentCashSgd)}
              </div>
              <div className="stat-label">Cash right now</div>
            </div>
            <p>{forecast.narrative}</p>
          </section>

          <section className="panel">
            <div className="grid-3">
              {forecast.periods.map((p) => (
                <div className="stat-card" key={p.label}>
                  <div className="stat-value">
                    {formatMoney(p.projectedCash)}
                  </div>
                  <div className="stat-label">{p.label}</div>
                  <p className="muted small" style={{ marginTop: 8 }}>
                    +{formatMoney(p.expectedIn)} in, −
                    {formatMoney(p.expectedOut)} out
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
