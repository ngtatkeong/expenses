import { NavLink } from "react-router-dom";

const links: { to: string; label: string }[] = [
  { to: "/accounting", label: "← Home" },
  { to: "/accounting/accounts", label: "Chart of Accounts" },
  { to: "/accounting/journal-entries", label: "Journal Entries" },
  { to: "/accounting/invoices", label: "Invoices" },
  { to: "/accounting/bills", label: "Bills" },
  { to: "/accounting/payments", label: "Payments" },
  { to: "/accounting/reports", label: "Reports" },
];

export default function AccountingNav() {
  return (
    <div className="filters-row" style={{ marginBottom: 4 }}>
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} className="btn btn-sm btn-ghost">
          {l.label}
        </NavLink>
      ))}
    </div>
  );
}
