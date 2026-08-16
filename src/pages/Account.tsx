import { useState } from "react";
import { useAuth } from "../store/AuthContext";
import { api, ApiError } from "../api/client";

export default function Account() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to change password",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>My Account</h1>
      </header>

      <section className="panel">
        <h2>Profile</h2>
        <div className="form-grid">
          <div className="field">
            <span className="muted small">Name</span>
            <span>{user?.name}</span>
          </div>
          <div className="field">
            <span className="muted small">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="field">
            <span className="muted small">Role</span>
            <span className="badge badge-role">{user?.role}</span>
          </div>
          <div className="field">
            <span className="muted small">Department</span>
            <span>{user?.department ?? "—"}</span>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          To change your name, department, or manager, ask an Admin — see Users
          in the admin panel.
        </p>
      </section>

      <section className="panel">
        <h2>Change Password</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="full-width">
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <div className="full-width">
            {error && <p className="error-text">{error}</p>}
            {success && (
              <p className="muted small">Password changed successfully.</p>
            )}
            <button
              className="btn"
              type="submit"
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              {busy ? "Changing…" : "Change Password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
