import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { User, Role } from "../api/types";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE" as Role,
    department: "",
    managerId: "",
  });
  const [error, setError] = useState("");

  function load() {
    api.get<User[]>("/users").then(setUsers);
  }
  useEffect(load, []);

  async function create() {
    setError("");
    try {
      await api.post("/users", {
        ...form,
        managerId: form.managerId || undefined,
        department: form.department || undefined,
      });
      setForm({
        name: "",
        email: "",
        password: "",
        role: "EMPLOYEE",
        department: "",
        managerId: "",
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    }
  }

  async function runUserUpdate(
    action: () => Promise<unknown>,
  ): Promise<boolean> {
    setError("");
    try {
      await action();
      load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That change failed");
      load(); // re-sync selects/inputs back to the real (unchanged) server state
      return false;
    }
  }

  async function updateRole(u: User, role: Role) {
    await runUserUpdate(() => api.patch(`/users/${u.id}`, { role }));
  }

  async function updateManager(u: User, managerId: string) {
    await runUserUpdate(() =>
      api.patch(`/users/${u.id}`, { managerId: managerId || null }),
    );
  }

  async function updateDepartment(u: User, department: string) {
    if (department === (u.department ?? "")) return; // no change, skip the request
    await runUserUpdate(() =>
      api.patch(`/users/${u.id}`, { department: department || null }),
    );
  }

  async function toggleActive(u: User) {
    await runUserUpdate(() =>
      api.patch(`/users/${u.id}`, { active: !u.active }),
    );
  }

  async function resetPassword(u: User) {
    const next = prompt(`Set a new password for ${u.name} (min 8 characters):`);
    if (!next) return;
    if (next.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }
    const ok = await runUserUpdate(() =>
      api.patch(`/users/${u.id}`, { password: next }),
    );
    if (ok) alert(`Password reset for ${u.name}. Share it with them securely.`);
  }

  const managers = users.filter(
    (u) => u.role === "MANAGER" || u.role === "ADMIN",
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
      </header>

      <section className="panel">
        <h2>Add a user</h2>
        <div className="form-grid">
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Temporary password
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as Role })
              }
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin/Finance</option>
            </select>
          </label>
          <label>
            Department
            <input
              type="text"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </label>
          <label>
            Manager
            <select
              value={form.managerId}
              onChange={(e) => setForm({ ...form, managerId: e.target.value })}
            >
              <option value="">None</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={create}>
          Create user
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel">
        <h2>All users</h2>
        {error && (
          <p className="error-text" style={{ marginBottom: 10 }}>
            {error}
          </p>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Manager</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u, e.target.value as Role)}
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin/Finance</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    defaultValue={u.department ?? ""}
                    placeholder="No department"
                    style={{ width: 140 }}
                    onBlur={(e) => updateDepartment(u, e.target.value.trim())}
                  />
                </td>
                <td>
                  <select
                    value={u.managerId ?? ""}
                    onChange={(e) => updateManager(u, e.target.value)}
                  >
                    <option value="">None</option>
                    {managers
                      .filter((m) => m.id !== u.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => toggleActive(u)}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => resetPassword(u)}
                  >
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
