import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type {
  Account,
  Bill,
  Invoice,
  Payment,
} from "../../api/accountingTypes";
import { formatDate, formatMoney } from "../../utils/format";
import AccountingNav from "./AccountingNav";

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [type, setType] = useState<"RECEIVED" | "PAID">("RECEIVED");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [billId, setBillId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get<Payment[]>("/accounting/payments").then(setPayments);
    api
      .get<Invoice[]>("/accounting/invoices")
      .then((all) =>
        setInvoices(
          all.filter(
            (i) =>
              i.status === "SENT" ||
              i.status === "PARTIALLY_PAID" ||
              i.status === "OVERDUE",
          ),
        ),
      );
    api
      .get<Bill[]>("/accounting/bills")
      .then((all) =>
        setBills(
          all.filter(
            (b) =>
              b.status === "RECEIVED" ||
              b.status === "PARTIALLY_PAID" ||
              b.status === "OVERDUE",
          ),
        ),
      );
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  const bankAccounts = accounts.filter((a) => a.type === "ASSET");

  async function submit() {
    setError("");
    try {
      if (!amount || !bankAccountId)
        throw new Error("Amount and bank/cash account are required");
      if (type === "RECEIVED" && !invoiceId)
        throw new Error("Select an invoice");
      if (type === "PAID" && !billId) throw new Error("Select a bill");
      await api.post("/accounting/payments", {
        type,
        date,
        amount: Number(amount),
        method: method || undefined,
        invoiceId: type === "RECEIVED" ? invoiceId : undefined,
        billId: type === "PAID" ? billId : undefined,
        bankAccountId,
      });
      setAmount("");
      setMethod("");
      setInvoiceId("");
      setBillId("");
      load();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to record payment",
      );
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Payments</h1>
        <p className="muted">
          Record money received against an invoice or paid against a bill.
        </p>
      </header>

      <AccountingNav />

      <section className="panel">
        <h2>Record payment</h2>
        <div className="filters-row">
          <label className="field">
            Type
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as "RECEIVED" | "PAID");
                setInvoiceId("");
                setBillId("");
              }}
            >
              <option value="RECEIVED">Received (from customer)</option>
              <option value="PAID">Paid (to vendor)</option>
            </select>
          </label>
          {type === "RECEIVED" ? (
            <label className="field" style={{ flex: 1 }}>
              Invoice
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              >
                <option value="">Select invoice…</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber} — {i.customer?.name} —{" "}
                    {formatMoney(i.total - i.paid)} outstanding
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field" style={{ flex: 1 }}>
              Bill
              <select
                value={billId}
                onChange={(e) => setBillId(e.target.value)}
              >
                <option value="">Select bill…</option>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.billNumber} — {b.vendor?.name} —{" "}
                    {formatMoney(b.total - b.paid)} outstanding
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            Amount
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: 120 }}
            />
          </label>
          <label className="field">
            Bank/cash account
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Select…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Method
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Bank transfer, cash…"
            />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" onClick={submit} style={{ marginTop: 8 }}>
          Record payment
        </button>
      </section>

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
