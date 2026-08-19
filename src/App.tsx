import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./store/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ExpensesList from "./pages/ExpensesList";
import ExpenseForm from "./pages/ExpenseForm";
import ExpenseDetail from "./pages/ExpenseDetail";
import Categories from "./pages/Categories";
import Users from "./pages/Users";
import SettingsPage from "./pages/SettingsPage";
import FiscalYears from "./pages/FiscalYears";
import Reports from "./pages/Reports";
import Account from "./pages/Account";
import ChartOfAccounts from "./pages/accounting/ChartOfAccounts";
import JournalEntries from "./pages/accounting/JournalEntries";
import Invoices from "./pages/accounting/Invoices";
import Bills from "./pages/accounting/Bills";
import Payments from "./pages/accounting/Payments";
import AccountingReports from "./pages/accounting/AccountingReports";
import "./App.css";

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/kaoinai-logo.png" alt="KaoinAI" className="brand-logo" />
          <div>
            <div className="brand-title">Expense Manager</div>
            <div className="brand-sub">by KaoinAI</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            Dashboard
          </NavLink>
          <NavLink to="/expenses" end className="nav-link">
            My Expenses
          </NavLink>
          <NavLink to="/expenses/new" className="nav-link">
            New Expense
          </NavLink>

          {(user?.role === "MANAGER" || user?.role === "ADMIN") && (
            <>
              <div className="nav-section-label">Approvals</div>
              <NavLink
                to="/expenses?status=PENDING_APPROVAL"
                className="nav-link"
              >
                Approval Queue
              </NavLink>
            </>
          )}

          {user?.role === "ADMIN" && (
            <>
              <div className="nav-section-label">Finance & Admin</div>
              <NavLink to="/reports" className="nav-link">
                Reports
              </NavLink>
              <NavLink to="/fiscal-years" className="nav-link">
                Fiscal Years
              </NavLink>
              <NavLink to="/categories" className="nav-link">
                Categories
              </NavLink>
              <NavLink to="/users" className="nav-link">
                Users
              </NavLink>
              <NavLink to="/settings" className="nav-link">
                Settings
              </NavLink>
              <div className="nav-section-label">Accounting</div>
              <NavLink to="/accounting/accounts" className="nav-link">
                Chart of Accounts
              </NavLink>
              <NavLink to="/accounting/journal-entries" className="nav-link">
                Journal Entries
              </NavLink>
              <NavLink to="/accounting/invoices" className="nav-link">
                Invoices
              </NavLink>
              <NavLink to="/accounting/bills" className="nav-link">
                Bills
              </NavLink>
              <NavLink to="/accounting/payments" className="nav-link">
                Payments
              </NavLink>
              <NavLink to="/accounting/reports" className="nav-link">
                Accounting Reports
              </NavLink>
            </>
          )}

          <div className="nav-section-label">Account</div>
          <NavLink to="/account" className="nav-link">
            My Account
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{user?.name}</div>
          <span className="role-badge">{user?.role}</span>
          <br />
          <button className="logout-link" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/expenses" element={<ExpensesList />} />
          <Route path="/expenses/new" element={<ExpenseForm />} />
          <Route path="/expenses/:id" element={<ExpenseDetail />} />
          <Route
            path="/reports"
            element={
              <RequireAdmin>
                <Reports />
              </RequireAdmin>
            }
          />
          <Route
            path="/fiscal-years"
            element={
              <RequireAdmin>
                <FiscalYears />
              </RequireAdmin>
            }
          />
          <Route
            path="/categories"
            element={
              <RequireAdmin>
                <Categories />
              </RequireAdmin>
            }
          />
          <Route
            path="/users"
            element={
              <RequireAdmin>
                <Users />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAdmin>
                <SettingsPage />
              </RequireAdmin>
            }
          />
          <Route path="/account" element={<Account />} />
          <Route
            path="/accounting/accounts"
            element={
              <RequireAdmin>
                <ChartOfAccounts />
              </RequireAdmin>
            }
          />
          <Route
            path="/accounting/journal-entries"
            element={
              <RequireAdmin>
                <JournalEntries />
              </RequireAdmin>
            }
          />
          <Route
            path="/accounting/invoices"
            element={
              <RequireAdmin>
                <Invoices />
              </RequireAdmin>
            }
          />
          <Route
            path="/accounting/bills"
            element={
              <RequireAdmin>
                <Bills />
              </RequireAdmin>
            }
          />
          <Route
            path="/accounting/payments"
            element={
              <RequireAdmin>
                <Payments />
              </RequireAdmin>
            }
          />
          <Route
            path="/accounting/reports"
            element={
              <RequireAdmin>
                <AccountingReports />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-shell">
        <p style={{ color: "white" }}>Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={user ? <Shell /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default App;
