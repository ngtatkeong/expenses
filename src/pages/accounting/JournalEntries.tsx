import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Account, JournalEntry } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

function emptyLine(): DraftLine {
  return { accountId: "", debit: "", credit: "", description: "" };
}

export default function JournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState("");

  function load() {
    api.get<JournalEntry[]>("/accounting/journal-entries").then(setEntries);
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  async function submit() {
    setError("");
    const payloadLines = lines
      .filter((l) => l.accountId && (Number(l.debit) || Number(l.credit)))
      .map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || undefined,
      }));
    if (payloadLines.length < 2) {
      setError("Add at least two lines with an account and an amount");
      return;
    }
    try {
      await api.post("/accounting/journal-entries", {
        date,
        memo: memo || undefined,
        lines: payloadLines,
      });
      setMemo("");
      setLines([emptyLine(), emptyLine()]);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post entry");
    }
  }

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
        <p className="muted">
          Manual double-entry postings. Every entry must have total debits equal
          to total credits — invoices, bills, and payments post their own
          entries automatically.
        </p>
      </header>

      <AccountingNav />

      <section className="panel">
        <h2>New manual entry</h2>
        <div className="filters-row">
          <label className="field">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            Memo
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="What is this entry for?"
            />
          </label>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Description</th>
              <th style={{ width: 120 }}>Debit</th>
              <th style={{ width: 120 }}>Credit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select
                    value={l.accountId}
                    onChange={(e) =>
                      updateLine(i, { accountId: e.target.value })
                    }
                  >
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={l.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={l.debit}
                    onChange={(e) =>
                      updateLine(i, {
                        debit: e.target.value,
                        credit: e.target.value ? "" : l.credit,
                      })
                    }
                    style={{ width: 100 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={l.credit}
                    onChange={(e) =>
                      updateLine(i, {
                        credit: e.target.value,
                        debit: e.target.value ? "" : l.debit,
                      })
                    }
                    style={{ width: 100 }}
                  />
                </td>
                <td>
                  {lines.length > 2 && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeLine(i)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <button className="btn btn-sm btn-ghost" onClick={addLine}>
                  + Add line
                </button>
              </td>
              <td>
                <strong>{formatMoney(totalDebit)}</strong>
              </td>
              <td>
                <strong>{formatMoney(totalCredit)}</strong>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {error && <p className="error-text">{error}</p>}
        <button className="btn" onClick={submit} style={{ marginTop: 8 }}>
          Post entry
        </button>
      </section>

      <section className="panel">
        <h2>Entries</h2>
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
