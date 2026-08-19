import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Payment } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);

  function load() {
    api.get<Payment[]>("/accounting/payments").then(setPayments);
  }
  useEffect(load, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Payments</h1>
        <Link to="/accounting/wizards/payment" className="btn">
          + Record money in or out
        </Link>
      </header>

      <AccountingNav />

      <p className="muted small">
        New payments are recorded through the guided{" "}
        <Link to="/accounting/wizards/payment">
          Record money in or out of the bank
        </Link>{" "}
        wizard so they're always matched to the right invoice or bill — this
        page is for viewing what's already been recorded.
      </p>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Against</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Bank/cash account</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.date)}</td>
                <td>
                  <span
                    className={`badge ${p.type === "RECEIVED" ? "badge-approved" : "badge-role"}`}
                  >
                    {p.type}
                  </span>
                </td>
                <td>{p.invoice?.invoiceNumber || p.bill?.billNumber || "—"}</td>
                <td>{formatMoney(p.amount)}</td>
                <td>{p.method || "—"}</td>
                <td>{p.bankAccount?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
