import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Account, Vendor, Bill } from "../../api/accountingTypes";
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
  RECEIVED: "badge-role",
  PARTIALLY_PAID: "badge-pending_approval",
  PAID: "badge-approved",
  OVERDUE: "badge-rejected",
  VOID: "badge-draft",
};

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [billNumber, setBillNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [payableAccountId, setPayableAccountId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState("");

  function load() {
    api.get<Bill[]>("/accounting/bills").then(setBills);
    api.get<Vendor[]>("/accounting/vendors").then(setVendors);
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  const payableAccounts = accounts.filter((a) => a.type === "LIABILITY");
  const expenseAccounts = accounts.filter(
    (a) => a.type === "EXPENSE" || a.type === "ASSET",
  );

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

  async function ensureVendor(): Promise<string> {
    if (vendorId) return vendorId;
    if (!newVendorName.trim()) throw new Error("Select or enter a vendor");
    const v = await api.post<Vendor>("/accounting/vendors", {
      name: newVendorName.trim(),
    });
    return v.id;
  }

  async function submit() {
    setError("");
    try {
      const vId = await ensureVendor();
      if (!billNumber || !dueDate || !payableAccountId) {
        throw new Error(
          "Bill number, due date, and payable account are required",
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
      await api.post("/accounting/bills", {
        billNumber,
        vendorId: vId,
        issueDate,
        dueDate,
        payableAccountId,
        lines: payloadLines,
      });
      setBillNumber("");
      setVendorId("");
      setNewVendorName("");
      setDueDate("");
      setLines([emptyLine()]);
      setShowForm(false);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to create bill",
      );
    }
  }

  async function voidBill(id: string) {
    await api.post(`/accounting/bills/${id}/void`);
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Bills (Purchases)</h1>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New bill"}
        </button>
      </header>

      <AccountingNav />

      {showForm && (
        <section className="panel">
          <h2>New bill</h2>
          <div className="filters-row">
            <label className="field">
              Bill #
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="BILL-0001"
              />
            </label>
            <label className="field">
              Vendor
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">New vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            {!vendorId && (
              <label className="field">
                New vendor name
                <input
                  type="text"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
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
              Payable account
              <select
                value={payableAccountId}
                onChange={(e) => setPayableAccountId(e.target.value)}
              >
                <option value="">Select…</option>
                {payableAccounts.map((a) => (
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
                <th>Expense account</th>
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
                      {expenseAccounts.map((a) => (
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
            Create & post bill
          </button>
        </section>
      )}

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
