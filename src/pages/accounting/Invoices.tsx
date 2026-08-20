import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Invoice } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import { useAiEnabled } from "../../hooks/useAiEnabled";
import AccountingNav from "./AccountingNav";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-draft",
  SENT: "badge-role",
  PARTIALLY_PAID: "badge-pending_approval",
  PAID: "badge-approved",
  OVERDUE: "badge-rejected",
  VOID: "badge-draft",
};

const OUTSTANDING_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const aiEnabled = useAiEnabled();
  const [reminderFor, setReminderFor] = useState<string | null>(null);
  const [reminderText, setReminderText] = useState("");
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  function load() {
    api.get<Invoice[]>("/accounting/invoices").then(setInvoices);
  }
  useEffect(load, []);

  async function voidInvoice(id: string) {
    await api.post(`/accounting/invoices/${id}/void`);
    load();
  }

  async function draftReminder(id: string) {
    setReminderFor(id);
    setReminderText("");
    setReminderError("");
    setCopyStatus("");
    setReminderLoading(true);
    try {
      const { message } = await api.post<{ message: string }>(
        "/ai/payment-reminder",
        {
          invoiceId: id,
        },
      );
      setReminderText(message);
    } catch (err) {
      setReminderError(
        err instanceof ApiError ? err.message : "Failed to draft a reminder",
      );
    } finally {
      setReminderLoading(false);
    }
  }

  async function copyReminder() {
    await navigator.clipboard.writeText(reminderText);
    setCopyStatus("Copied!");
    setTimeout(() => setCopyStatus(""), 2000);
  }

  const reminderInvoice = invoices.find((i) => i.id === reminderFor);

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

      {reminderFor && (
        <section className="panel">
          <div className="panel-header">
            <h2>Reminder for {reminderInvoice?.invoiceNumber}</h2>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setReminderFor(null)}
            >
              Close
            </button>
          </div>
          {reminderLoading && <p className="muted small">✨ Drafting…</p>}
          {reminderError && <p className="error-text small">{reminderError}</p>}
          {reminderText && (
            <>
              <textarea
                readOnly
                rows={5}
                value={reminderText}
                style={{ width: "100%" }}
              />
              <div className="filters-row" style={{ marginTop: 8 }}>
                <button className="btn btn-sm" onClick={copyReminder}>
                  Copy
                </button>
                {copyStatus && (
                  <span className="muted small">{copyStatus}</span>
                )}
              </div>
              <p className="muted small" style={{ marginTop: 4 }}>
                This isn't sent automatically — copy it into your own email or
                message.
              </p>
            </>
          )}
        </section>
      )}

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
                <td style={{ display: "flex", gap: 6 }}>
                  {aiEnabled && OUTSTANDING_STATUSES.includes(inv.status) && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => draftReminder(inv.id)}
                    >
                      ✨ Draft reminder
                    </button>
                  )}
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
