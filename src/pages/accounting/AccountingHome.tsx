import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Account } from "../../api/accountingTypes";

const TASKS = [
  {
    to: "/accounting/wizards/sale",
    icon: "💰",
    title: "Record a sale",
    desc: "A customer bought something from you, or owes you money. Creates an invoice.",
  },
  {
    to: "/accounting/wizards/expense",
    icon: "🧾",
    title: "Record a purchase or expense",
    desc: "You bought something, or owe a supplier money. Creates a bill.",
  },
  {
    to: "/accounting/wizards/payment",
    icon: "🏦",
    title: "Record money in or out of the bank",
    desc: "A customer paid you, or you paid a supplier. Matches it to the sale/purchase.",
  },
  {
    to: "/accounting/wizards/other",
    icon: "🔀",
    title: "Record something else",
    desc: "Any other money movement — e.g. moving cash between accounts, an owner contribution.",
  },
  {
    to: "/accounting/wizards/setup",
    icon: "⚙️",
    title: "Set up categories",
    desc: "The list of things you can record money against — bank accounts, income types, expense types.",
  },
  {
    to: "/accounting/wizards/reports",
    icon: "📊",
    title: "See how the business is doing",
    desc: "Are you making money, and what do you own vs owe — explained in plain English.",
  },
  {
    to: "/accounting/wizards/iras",
    icon: "🏛️",
    title: "Prepare your IRAS tax filing summary",
    desc: "The revenue and profit figures you'll need for Form C-S / ECI, ready to download.",
  },
];

export default function AccountingHome() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Accounting</h1>
        <p className="muted">
          A simple bookkeeping system for a small company. No accounting
          background needed — pick what you're trying to do below and it'll walk
          you through it.
        </p>
      </header>

      {accounts && accounts.length === 0 && (
        <div className="callout callout-info">
          You haven't set up your categories yet — start with{" "}
          <Link to="/accounting/wizards/setup">Set up categories</Link> before
          recording your first sale or purchase.
        </div>
      )}

      <div className="grid-3">
        {TASKS.map((t) => (
          <Link key={t.to} to={t.to} className="task-card">
            <span className="task-card-icon">{t.icon}</span>
            <span className="task-card-title">{t.title}</span>
            <span className="muted small">{t.desc}</span>
          </Link>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: 24 }}>
        Stick to the steps above — that's all you need. If your accountant needs
        to look at the technical records directly,{" "}
        <Link to="/accounting/accounts">they can find those here</Link>.
      </p>
    </div>
  );
}
