import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { Account, Bill, Invoice } from "../../../api/accountingTypes";
import { formatDate, formatMoney } from "../../../utils/format";
import WizardShell from "./WizardShell";

const STEPS = ["Money in or out?", "Which one?", "Details", "Review & confirm"];

export default function PaymentWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<"RECEIVED" | "PAID" | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState("");
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function load() {
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

  const bankAccounts = accounts.filter(
    (a) => a.type === "ASSET" && !/receivable/i.test(a.name),
  );
  const selectedInvoice = invoices.find((i) => i.id === invoiceId);
  const selectedBill = bills.find((b) => b.id === billId);

  function selectInvoice(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) setAmount(String(inv.total - inv.paid));
  }
  function selectBill(id: string) {
    setBillId(id);
    const b = bills.find((b2) => b2.id === id);
    if (b) setAmount(String(b.total - b.paid));
  }

  async function submit() {
    setError("");
    if (!amount || !bankAccountId) {
      setError("Enter an amount and pick a bank/cash account");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/accounting/payments", {
        type,
        date,
        amount: Number(amount),
        method: method || undefined,
        invoiceId: type === "RECEIVED" ? invoiceId : undefined,
        billId: type === "PAID" ? billId : undefined,
        bankAccountId,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to record payment",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <WizardShell
        title="Payment recorded"
        stepLabels={STEPS}
        stepIndex={3}
        onNext={() => navigate("/accounting")}
        nextLabel="Back to Accounting home"
      >
        <div className="callout callout-info">
          {formatMoney(Number(amount))} has been recorded as{" "}
          {type === "RECEIVED" ? "received" : "paid"}.
        </div>
      </WizardShell>
    );
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Record money in or out of the bank"
        intro="Did money come into the business, or go out of it?"
        stepLabels={STEPS}
        stepIndex={0}
        onNext={() => setStep(1)}
        nextDisabled={!type}
      >
        <div className="big-choice-row">
          <button
            className={`big-choice ${type === "RECEIVED" ? "selected" : ""}`}
            onClick={() => setType("RECEIVED")}
          >
            <div className="big-choice-title">💰 Money came in</div>
            <div className="muted small">A customer paid an invoice</div>
          </button>
          <button
            className={`big-choice ${type === "PAID" ? "selected" : ""}`}
            onClick={() => setType("PAID")}
          >
            <div className="big-choice-title">💸 Money went out</div>
            <div className="muted small">You paid a bill to a vendor</div>
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === 1) {
    const list = type === "RECEIVED" ? invoices : bills;
    return (
      <WizardShell
        title={
          type === "RECEIVED"
            ? "Which invoice did they pay?"
            : "Which bill did you pay?"
        }
        stepLabels={STEPS}
        stepIndex={1}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={type === "RECEIVED" ? !invoiceId : !billId}
      >
        {list.length === 0 ? (
          <p className="muted">
            There's nothing outstanding to match.{" "}
            {type === "RECEIVED" ? "Record a sale" : "Record a purchase"} first
            if you haven't already.
          </p>
        ) : type === "RECEIVED" ? (
          <select
            value={invoiceId}
            onChange={(e) => selectInvoice(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Select invoice…</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber} — {i.customer?.name} —{" "}
                {formatMoney(i.total - i.paid)} outstanding
              </option>
            ))}
          </select>
        ) : (
          <select
            value={billId}
            onChange={(e) => selectBill(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Select bill…</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.billNumber} — {b.vendor?.name} —{" "}
                {formatMoney(b.total - b.paid)} outstanding
              </option>
            ))}
          </select>
        )}
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        title="Details"
        stepLabels={STEPS}
        stepIndex={2}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        nextDisabled={!amount || !bankAccountId}
      >
        <div className="filters-row">
          <label className="field">
            Amount
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: 140 }}
            />
          </label>
          <label className="field">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            {type === "RECEIVED"
              ? "Which account did the money land in?"
              : "Which account did the money come out of?"}
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Select…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            How? (optional)
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Bank transfer, cash…"
            />
          </label>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      title="Review & confirm"
      stepLabels={STEPS}
      stepIndex={3}
      onBack={() => setStep(2)}
      onNext={submit}
      nextLabel={submitting ? "Recording…" : "Confirm & record payment"}
      nextDisabled={submitting}
      error={error}
    >
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          {type === "RECEIVED" ? "Received from" : "Paid to"}:{" "}
          <strong>
            {type === "RECEIVED"
              ? selectedInvoice?.customer?.name
              : selectedBill?.vendor?.name}
          </strong>
        </li>
        <li>
          Against:{" "}
          <strong>
            {type === "RECEIVED"
              ? selectedInvoice?.invoiceNumber
              : selectedBill?.billNumber}
          </strong>
        </li>
        <li>
          Amount: <strong>{formatMoney(Number(amount) || 0)}</strong>
        </li>
        <li>Date: {formatDate(date)}</li>
        <li>Account: {accounts.find((a) => a.id === bankAccountId)?.name}</li>
      </ul>
    </WizardShell>
  );
}
