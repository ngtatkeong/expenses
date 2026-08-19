import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Account } from "../../api/accountingTypes";
import AccountingNav from "./AccountingNav";

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  function load() {
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  async function toggleActive(a: Account) {
    await api.patch(`/accounting/accounts/${a.id}`, { active: !a.active });
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Chart of Accounts</h1>
        <Link to="/accounting/wizards/setup" className="btn">
          + Set up / add categories
        </Link>
      </header>

      <AccountingNav />

      {accounts.length === 0 ? (
        <section className="panel">
          <p className="muted small">
            No categories set up yet — head to{" "}
            <Link to="/accounting/wizards/setup">Set up categories</Link> to get
            started.
          </p>
        </section>
      ) : (
        <p className="muted small">
          These are the categories every wizard uses behind the scenes. Add more
          from the <Link to="/accounting/wizards/setup">Set up categories</Link>{" "}
          wizard.
        </p>
      )}

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
