import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import type { Account, AccountType } from "../../../api/accountingTypes";
import WizardShell from "./WizardShell";

const FRIENDLY_TYPES: { value: AccountType; label: string; hint: string }[] = [
  {
    value: "ASSET",
    label: "A bank or cash account",
    hint: 'Somewhere money is held, e.g. "DBS Current Account" or "Petty Cash"',
  },
  {
    value: "INCOME",
    label: "A way money comes in",
    hint: 'e.g. "Consulting Revenue", "Product Sales"',
  },
  {
    value: "EXPENSE",
    label: "A way money goes out",
    hint: 'e.g. "Software Subscriptions", "Marketing"',
  },
  {
    value: "LIABILITY",
    label: "Money the business owes",
    hint: "e.g. a loan, or GST collected but not yet paid to IRAS",
  },
  {
    value: "EQUITY",
    label: "Owner's stake in the business",
    hint: "e.g. capital the owner put in",
  },
];

const STEPS = ["Get started", "Add your own (optional)", "Done"];

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("EXPENSE");
  const [added, setAdded] = useState<string[]>([]);

  function load() {
    api.get<Account[]>("/accounting/accounts").then(setAccounts);
  }
  useEffect(load, []);

  async function seedDefaults() {
    setSeeding(true);
    setError("");
    try {
      await api.post("/accounting/setup/seed");
      load();
      setStep(1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to set up categories",
      );
    } finally {
      setSeeding(false);
    }
  }

  async function addCategory() {
    if (!name.trim()) return;
    setError("");
    try {
      const nextCode = String(
        (Math.max(0, ...accounts.map((a) => Number(a.code) || 0)) || 9000) + 1,
      );
      await api.post("/accounting/accounts", {
        code: nextCode,
        name: name.trim(),
        type,
      });
      setAdded((prev) => [...prev, name.trim()]);
      setName("");
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to add category",
      );
    }
  }

  if (step === 0) {
    return (
      <WizardShell
        title="Set up categories"
        intro="Categories are the buckets every transaction gets sorted into — a bank account, a type of income, a type of expense. You only need to do this once."
        stepLabels={STEPS}
        stepIndex={0}
        onNext={accounts.length > 0 ? () => setStep(1) : seedDefaults}
        nextLabel={
          accounts.length > 0
            ? "Continue — categories already set up"
            : seeding
              ? "Setting up…"
              : "Set up the standard categories"
        }
        nextDisabled={seeding}
        error={error}
      >
        {accounts.length === 0 ? (
          <>
            <p>
              We'll create a standard starting set for a small Singapore
              company: Bank Account, Cash, Accounts Receivable/Payable, Share
              Capital, Sales Revenue, and common expense categories (Rent,
              Salaries, Office Supplies, Professional Fees, Utilities). You can
              rename or add to these any time.
            </p>
          </>
        ) : (
          <p>
            You already have {accounts.length} categories set up. You can
            continue, or add more in the next step.
          </p>
        )}
      </WizardShell>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        title="Add your own categories (optional)"
        intro="Add anything specific to your business — a second bank account, a custom income or expense type. Skip if the standard set already covers you."
        stepLabels={STEPS}
        stepIndex={1}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextLabel="Continue"
        error={error}
      >
        <div className="filters-row">
          <label className="field" style={{ flex: 1 }}>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grab / taxi expenses"
            />
          </label>
          <label className="field" style={{ minWidth: 260 }}>
            What kind of category is this?
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {FRIENDLY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            style={{ alignSelf: "flex-end" }}
            onClick={addCategory}
          >
            + Add
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>
          {FRIENDLY_TYPES.find((t) => t.value === type)?.hint}
        </p>

        {added.length > 0 && (
          <div className="callout callout-info" style={{ marginTop: 12 }}>
            Added: {added.join(", ")}
          </div>
        )}
      </WizardShell>
    );
  }

  return (
    <WizardShell
      title="All set"
      stepLabels={STEPS}
      stepIndex={2}
      onBack={() => setStep(1)}
      onNext={() => navigate("/accounting")}
      nextLabel="Back to Accounting home"
    >
      <p>
        Your categories are ready ({accounts.length} total). Next, try recording
        your first sale or purchase from the Accounting home page.
      </p>
    </WizardShell>
  );
}
