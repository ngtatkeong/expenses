import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Invoice } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-draft",
  SENT: "badge-role",
  PARTIALLY_PAID: "badge-pending_approval",
  PAID: "badge-approved",
  OVERDUE: "badge-rejected",
  VOID: "badge-draft",
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  function load() {
    api.get<Invoice[]>("/accounting/invoices").then(setInvoices);
  }
  useEffect(load, []);

  async function voidInvoice(id: string) {
    await api.post(`/accounting/invoices/${id}/void`);
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Invoices (Sales)</h1>
        <Link to="/accounting/wizards/sale" className="btn">
          + Record a sale
        </Link>
      </header>

      <AccountingNav />

      <p className="muted small">
        New invoices are created through the guided{" "}
        <Link to="/accounting/wizards/sale">Record a sale</Link> wizard so every
        entry stays correctly balanced — this page is for viewing and voiding
        existing ones.
      </p>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Issue date</th>
              <th>Due date</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.invoiceNumber}</td>
                <td>{inv.customer?.name}</td>
                <td>{formatDate(inv.issueDate)}</td>
                <td>{formatDate(inv.dueDate)}</td>
                <td>{formatMoney(inv.total)}</td>
                <td>{formatMoney(inv.paid)}</td>
                <td>
                  <span
                    className={`badge ${STATUS_BADGE[inv.status] ?? "badge-draft"}`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td>
                  {inv.status !== "VOID" && inv.status !== "PAID" && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => voidInvoice(inv.id)}
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
