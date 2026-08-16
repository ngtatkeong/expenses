import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ExpenseCategory } from "../api/types";

export default function Categories() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get<ExpenseCategory[]>("/categories?all=1").then(setCategories);
  }
  useEffect(load, []);

  async function create() {
    if (!name.trim()) return;
    setError("");
    try {
      await api.post("/categories", {
        name: name.trim(),
        spendingLimitPerExpense: limit ? Number(limit) : null,
      });
      setName("");
      setLimit("");
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create category",
      );
    }
  }

  async function toggleActive(c: ExpenseCategory) {
    await api.patch(`/categories/${c.id}`, { active: !c.active });
    load();
  }

  async function updateLimit(c: ExpenseCategory, value: string) {
    await api.patch(`/categories/${c.id}`, {
      spendingLimitPerExpense: value ? Number(value) : null,
    });
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Expense Categories</h1>
      </header>

      <section className="panel">
        <h2>Add category</h2>
        <div className="filters-row">
          <input
            type="text"
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            placeholder="Per-expense limit (optional)"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            style={{ width: 220 }}
          />
          <button className="btn" onClick={create}>
            Add
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Per-expense limit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={c.spendingLimitPerExpense ?? ""}
                    placeholder="No limit"
                    style={{ width: 140 }}
                    onBlur={(e) => updateLimit(c, e.target.value)}
                  />
                </td>
                <td>
                  <span
                    className={`badge ${c.active ? "badge-approved" : "badge-draft"}`}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => toggleActive(c)}
                  >
                    {c.active ? "Deactivate" : "Reactivate"}
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
