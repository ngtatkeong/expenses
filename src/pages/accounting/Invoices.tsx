import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Account, Customer, Invoice } from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
}

function emptyLine(): DraftLine {
  return { description: "", quantity: "1", unitPrice: "", accountId: "" };
}

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [receivableAccountId, setReceivableAccountId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState("");

  function load() {
    api.get<Invoice[]>("/accounting/invoices").then(setInvoices);
    api.get<Customer[]>("/accounting/customers").then(setCustomers);
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  const receivableAccounts = accounts.filter((a) => a.type === "ASSET");
  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");

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

  const total = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  async function ensureCustomer(): Promise<string> {
    if (customerId) return customerId;
    if (!newCustomerName.trim()) throw new Error("Select or enter a customer");
    const c = await api.post<Customer>("/accounting/customers", {
      name: newCustomerName.trim(),
    });
    return c.id;
  }

  async function submit() {
    setError("");
    try {
      const custId = await ensureCustomer();
      if (!invoiceNumber || !dueDate || !receivableAccountId) {
        throw new Error(
          "Invoice number, due date, and receivable account are required",
        );
      }
      const payloadLines = lines
        .filter((l) => l.description && l.accountId && Number(l.unitPrice))
        .map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice),
          accountId: l.accountId,
        }));
      if (payloadLines.length === 0) throw new Error("Add at least one line");
      await api.post("/accounting/invoices", {
        invoiceNumber,
        customerId: custId,
        issueDate,
        dueDate,
        receivableAccountId,
        lines: payloadLines,
      });
      setInvoiceNumber("");
      setCustomerId("");
      setNewCustomerName("");
      setDueDate("");
      setLines([emptyLine()]);
      setShowForm(false);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to create invoice",
      );
    }
  }

  async function voidInvoice(id: string) {
    await api.post(`/accounting/invoices/${id}/void`);
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Invoices (Sales)</h1>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New invoice"}
        </button>
      </header>

      <AccountingNav />

      {showForm && (
        <section className="panel">
          <h2>New invoice</h2>
          <div className="filters-row">
            <label className="field">
              Invoice #
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-0001"
              />
            </label>
            <label className="field">
              Customer
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">New customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!customerId && (
              <label className="field">
                New customer name
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              Issue date
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </label>
            <label className="field">
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="field">
              Receivable account
              <select
                value={receivableAccountId}
                onChange={(e) => setReceivableAccountId(e.target.value)}
              >
                <option value="">Select…</option>
                {receivableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120 }}>Unit price</th>
                <th>Income account</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
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
                      value={l.quantity}
                      onChange={(e) =>
                        updateLine(i, { quantity: e.target.value })
                      }
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) =>
                        updateLine(i, { unitPrice: e.target.value })
                      }
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <select
                      value={l.accountId}
                      onChange={(e) =>
                        updateLine(i, { accountId: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      {incomeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {lines.length > 1 && (
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
                <td colSpan={2}>
                  <strong>Total: {formatMoney(total)}</strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {error && <p className="error-text">{error}</p>}
          <button className="btn" onClick={submit} style={{ marginTop: 8 }}>
            Create & post invoice
          </button>
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
