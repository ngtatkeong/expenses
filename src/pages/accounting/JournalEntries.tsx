import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { JournalEntry } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

export default function JournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [error, setError] = useState("");

  function load() {
    api.get<JournalEntry[]>("/accounting/journal-entries").then(setEntries);
  }
  useEffect(load, []);

  async function remove(id: string) {
    try {
      await api.delete(`/accounting/journal-entries/${id}`);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to delete entry",
      );
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Journal Entries</h1>
        <Link to="/accounting/wizards/other" className="btn">
          + Record something else
        </Link>
      </header>

      <AccountingNav />

      <p className="muted small">
        This is the full record of every transaction — sales, purchases,
        payments, and anything recorded via{" "}
        <Link to="/accounting/wizards/other">Record something else</Link>. It's
        here for reference; use the wizards on the{" "}
        <Link to="/accounting">Accounting home page</Link> to add new
        transactions.
      </p>

      {error && <p className="error-text">{error}</p>}

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Memo</th>
              <th>Source</th>
              <th>Lines</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.date)}</td>
                <td>{e.memo || e.reference || "—"}</td>
                <td>
                  <span className="badge badge-role">{e.source}</span>
                </td>
                <td>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {e.lines.map((l) => (
                      <li key={l.id} className="muted small">
                        {l.account?.code} {l.account?.name}:{" "}
                        {l.debit > 0
                          ? `Dr ${formatMoney(l.debit)}`
                          : `Cr ${formatMoney(l.credit)}`}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  {e.source === "MANUAL" && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => remove(e.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
