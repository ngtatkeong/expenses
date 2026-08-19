import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Bill } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-draft",
  RECEIVED: "badge-role",
  PARTIALLY_PAID: "badge-pending_approval",
  PAID: "badge-approved",
  OVERDUE: "badge-rejected",
  VOID: "badge-draft",
};

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([]);

  function load() {
    api.get<Bill[]>("/accounting/bills").then(setBills);
  }
  useEffect(load, []);

  async function voidBill(id: string) {
    await api.post(`/accounting/bills/${id}/void`);
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Bills (Purchases)</h1>
        <Link to="/accounting/wizards/expense" className="btn">
          + Record a purchase or expense
        </Link>
      </header>

      <AccountingNav />

      <p className="muted small">
        New bills are created through the guided{" "}
        <Link to="/accounting/wizards/expense">
          Record a purchase or expense
        </Link>{" "}
        wizard so every entry stays correctly balanced — this page is for
        viewing and voiding existing ones.
      </p>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Vendor</th>
              <th>Issue date</th>
              <th>Due date</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id}>
                <td>{b.billNumber}</td>
                <td>{b.vendor?.name}</td>
                <td>{formatDate(b.issueDate)}</td>
                <td>{formatDate(b.dueDate)}</td>
                <td>{formatMoney(b.total)}</td>
                <td>{formatMoney(b.paid)}</td>
                <td>
                  <span
                    className={`badge ${STATUS_BADGE[b.status] ?? "badge-draft"}`}
                  >
                    {b.status}
                  </span>
                </td>
                <td>
                  {b.status !== "VOID" && b.status !== "PAID" && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => voidBill(b.id)}
                    >
                      Void
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
