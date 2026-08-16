import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { SpendItem } from "../api/types";
import { formatMoney } from "../utils/format";

const COLORS = [
  "#0f766e",
  "#0ea5e9",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#6366f1",
  "#ec4899",
];

interface NamedTotal {
  name: string;
  total: number;
}

interface SpendBreakdownProps {
  title: string;
  items: SpendItem[];
  byCategory: NamedTotal[];
  byDepartment?: NamedTotal[];
  currency?: string;
  onCategoryClick?: (name: string | null) => void;
  activeCategory?: string | null;
}

export default function SpendBreakdown({
  title,
  items,
  byCategory,
  byDepartment,
  currency = "SGD",
  onCategoryClick,
  activeCategory,
}: SpendBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const total = byCategory.reduce((s, c) => s + c.total, 0);
  const visibleItems = activeCategory
    ? items.filter((i) => i.category === activeCategory)
    : items;
  const maxAmount = visibleItems[0]?.amount ?? 1;
  const topOutlay = items[0];
  const average = items.length ? total / items.length : 0;
  const deptTotal = byDepartment?.reduce((s, d) => s + d.total, 0) ?? 0;
  const maxDept = byDepartment?.[0]?.total ?? 1;

  return (
    <>
      <section className="grid-4">
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Total {title}</span>
            <span className="kpi-icon">💰</span>
          </div>
          <div className="kpi-value">{formatMoney(total, currency)}</div>
          <div className="kpi-bar" style={{ background: "#0f766e" }} />
        </div>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Logged Items</span>
            <span className="kpi-icon">📋</span>
          </div>
          <div className="kpi-value">{items.length}</div>
          <div className="muted small">
            Across {byCategory.length} categor
            {byCategory.length === 1 ? "y" : "ies"}
          </div>
          <div className="kpi-bar" style={{ background: "#0ea5e9" }} />
        </div>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Average / Item</span>
            <span className="kpi-icon">📊</span>
          </div>
          <div className="kpi-value">{formatMoney(average, currency)}</div>
          <div className="kpi-bar" style={{ background: "#f59e0b" }} />
        </div>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Top Outlay</span>
            <span className="kpi-icon">↗</span>
          </div>
          <div className="kpi-value">
            {topOutlay ? formatMoney(topOutlay.amount, currency) : "—"}
          </div>
          <div className="muted small" style={{ color: "#a855f7" }}>
            {topOutlay
              ? `${topOutlay.vendor} (${topOutlay.category})`
              : "No items yet"}
          </div>
          <div className="kpi-bar" style={{ background: "#a855f7" }} />
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h2>Category Allocation</h2>
            {activeCategory && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => onCategoryClick?.(null)}
              >
                Clear filter
              </button>
            )}
          </div>
          {byCategory.length === 0 ? (
            <p className="muted small">No expenses logged yet.</p>
          ) : (
            <div className="donut-row">
              <div className="donut-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={2}
                      onClick={(d) => {
                        const name = d?.name ?? null;
                        onCategoryClick?.(
                          name === activeCategory ? null : name,
                        );
                      }}
                    >
                      {byCategory.map((c, i) => (
                        <Cell
                          key={c.name}
                          fill={COLORS[i % COLORS.length]}
                          opacity={
                            activeCategory && activeCategory !== c.name
                              ? 0.35
                              : 1
                          }
                          cursor={onCategoryClick ? "pointer" : "default"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatMoney(Number(v), currency)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <div className="donut-center-label">TOTAL</div>
                  <div className="donut-center-value">
                    {formatMoney(total, currency)}
                  </div>
                  <div className="muted small">{items.length} items</div>
                </div>
              </div>
              <div className="legend-list">
                {byCategory.map((c, i) => (
                  <button
                    key={c.name}
                    className={`legend-row ${activeCategory === c.name ? "active" : ""}`}
                    onClick={() =>
                      onCategoryClick?.(
                        c.name === activeCategory ? null : c.name,
                      )
                    }
                  >
                    <span
                      className="legend-dot"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="legend-name">{c.name}</span>
                    <span className="legend-amount">
                      {formatMoney(c.total, currency)}
                    </span>
                    <span className="legend-pct">
                      {total ? Math.round((c.total / total) * 1000) / 10 : 0}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="muted small" style={{ marginTop: 8 }}>
            {onCategoryClick
              ? "Click a slice or row to filter items on the right."
              : `Showing all ${byCategory.length} categories`}
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Expense Item Comparison</h2>
            <span className="muted small">Ranked by magnitude</span>
          </div>
          {visibleItems.length === 0 ? (
            <p className="muted small">No items in this view.</p>
          ) : (
            <div className="item-comparison-list">
              {(expanded ? visibleItems : visibleItems.slice(0, 6)).map(
                (item) => (
                  <div key={item.id} className="item-comparison-row">
                    <div className="item-comparison-top">
                      <span className="item-vendor">{item.vendor}</span>
                      <span className="badge badge-role">{item.category}</span>
                      <span className="item-pct">
                        {total ? ((item.amount / total) * 100).toFixed(1) : "0"}
                        %
                      </span>
                      <span className="item-amount">
                        {formatMoney(item.amount, currency)}
                      </span>
                    </div>
                    <div className="item-bar-track">
                      <div
                        className="item-bar-fill"
                        style={{
                          width: `${maxAmount ? (item.amount / maxAmount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
          {visibleItems.length > 6 && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show fewer" : `Show all ${visibleItems.length}`}
            </button>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>
            Mean line: {formatMoney(average, currency)} · {currency}
          </p>
        </div>
      </section>

      {byDepartment && byDepartment.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>Spend by Department</h2>
            <span className="muted small">
              {byDepartment.length} department
              {byDepartment.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="item-comparison-list">
            {byDepartment.map((d, i) => (
              <div key={d.name} className="item-comparison-row">
                <div className="item-comparison-top">
                  <span
                    className="legend-dot"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="item-vendor">{d.name}</span>
                  <span className="item-pct">
                    {deptTotal ? ((d.total / deptTotal) * 100).toFixed(1) : "0"}
                    %
                  </span>
                  <span className="item-amount">
                    {formatMoney(d.total, currency)}
                  </span>
                </div>
                <div className="item-bar-track">
                  <div
                    className="item-bar-fill"
                    style={{
                      width: `${maxDept ? (d.total / maxDept) * 100 : 0}%`,
                      background: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
