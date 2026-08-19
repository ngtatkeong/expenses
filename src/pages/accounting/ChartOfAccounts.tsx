import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Account, AccountType } from "../../api/accountingTypes";
import AccountingNav from "./AccountingNav";

const TYPES: AccountType[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
];

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("EXPENSE");
  const [error, setError] = useState("");

  function load() {
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  async function seed() {
    await api.post("/accounting/setup/seed");
    load();
  }

  async function create() {
    if (!code.trim() || !name.trim()) return;
    setError("");
    try {
      await api.post("/accounting/accounts", {
        code: code.trim(),
        name: name.trim(),
        type,
      });
      setCode("");
      setName("");
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create account",
      );
    }
  }

  async function toggleActive(a: Account) {
    await api.patch(`/accounting/accounts/${a.id}`, { active: !a.active });
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Chart of Accounts</h1>
        <p className="muted">
          The list of accounts every journal entry, invoice, and bill posts
          against.
        </p>
      </header>

      <AccountingNav />

      {accounts.length === 0 && (
        <section className="panel">
          <p className="muted small">No accounts yet.</p>
          <button className="btn" onClick={seed}>
            Set up default chart of accounts
          </button>
        </section>
      )}

      <section className="panel">
        <h2>Add account</h2>
        <div className="filters-row">
          <input
            type="text"
            placeholder="Code (e.g. 6500)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btn" onClick={create}>
            Add
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.code}</td>
                <td>{a.name}</td>
                <td>{a.type}</td>
                <td>
                  <span
                    className={`badge ${a.active ? "badge-approved" : "badge-draft"}`}
                  >
                    {a.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => toggleActive(a)}
                  >
                    {a.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
