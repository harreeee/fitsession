"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type DebtFormRow = {
  id: string;
  title: string;
  amount: string;
  deadline: string;
  note: string;
};

const CLIENT_SOURCE_OPTIONS = [
  { value: "", label: "Select source" },
  { value: "coach", label: "Coach" },
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "direct_lead_walk_in", label: "Direct Lead (Walk In)" },
  { value: "referral_lead", label: "Referral Lead" },
  { value: "other", label: "Other" },
];

function generateQrToken() {
  return `FXA-${crypto.randomUUID()}`;
}

function createEmptyDebtRow(): DebtFormRow {
  return {
    id: crypto.randomUUID(),
    title: "",
    amount: "",
    deadline: "",
    note: "",
  };
}

function getNumberValue(value: string) {
  if (!value.trim()) return 0;

  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) return null;

  return parsedValue;
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getNearestDeadline(debts: DebtFormRow[]) {
  const validDeadlines = debts
    .map((debt) => debt.deadline)
    .filter(Boolean)
    .sort();

  return validDeadlines[0] || null;
}

export default function AddClientPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [clientSource, setClientSource] = useState("");
  const [clientSourceOther, setClientSourceOther] = useState("");
  const [clientNote, setClientNote] = useState("");

  const [packageName, setPackageName] = useState("");
  const [packageValue, setPackageValue] = useState("");
  const [sessions, setSessions] = useState("");
  const [packageStartDate, setPackageStartDate] = useState("");
  const [packageExpireDate, setPackageExpireDate] = useState("");
  const [purchaseType, setPurchaseType] = useState("");

  const [debts, setDebts] = useState<DebtFormRow[]>([createEmptyDebtRow()]);

  const [loading, setLoading] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking admin access...");

  const numericPackageValue = useMemo(() => {
    const value = getNumberValue(packageValue);
    return value === null ? null : value;
  }, [packageValue]);

  const totalDebt = useMemo(() => {
    return debts.reduce((sum, debt) => {
      const amount = getNumberValue(debt.amount);

      if (amount === null || amount <= 0) return sum;

      return sum + amount;
    }, 0);
  }, [debts]);

  const nearestDebtDeadline = useMemo(() => {
    return getNearestDeadline(
      debts.filter((debt) => {
        const amount = getNumberValue(debt.amount);
        return amount !== null && amount > 0;
      })
    );
  }, [debts]);

  const amountPaid = useMemo(() => {
    if (numericPackageValue === null) return 0;

    return Math.max(numericPackageValue - totalDebt, 0);
  }, [numericPackageValue, totalDebt]);

  function updateDebtRow(
    id: string,
    field: keyof Omit<DebtFormRow, "id">,
    value: string
  ) {
    setDebts((currentDebts) =>
      currentDebts.map((debt) =>
        debt.id === id
          ? {
              ...debt,
              [field]: value,
            }
          : debt
      )
    );
  }

  function addDebtRow() {
    setDebts((currentDebts) => [...currentDebts, createEmptyDebtRow()]);
  }

  function removeDebtRow(id: string) {
    setDebts((currentDebts) => {
      if (currentDebts.length === 1) {
        return [createEmptyDebtRow()];
      }

      return currentDebts.filter((debt) => debt.id !== id);
    });
  }

  useEffect(() => {
    async function protectAddClientPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/scan");
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingRole(false);
    }

    protectAddClientPage();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim()) {
      alert("Client name is required.");
      return;
    }

    if (clientSource === "other" && !clientSourceOther.trim()) {
      alert("Please specify the other client source.");
      return;
    }

    const totalSessions = Number(sessions);

    if (Number.isNaN(totalSessions) || totalSessions < 0) {
      alert("Please enter a valid number of sessions.");
      return;
    }

    if (numericPackageValue === null || numericPackageValue < 0) {
      alert("Package value must be a valid number.");
      return;
    }

    const cleanDebts = debts
      .map((debt) => {
        const amount = getNumberValue(debt.amount);

        return {
          title: debt.title.trim(),
          amount,
          deadline: debt.deadline,
          note: debt.note.trim(),
        };
      })
      .filter((debt) => debt.amount !== null && debt.amount > 0);

    const invalidDebt = cleanDebts.find((debt) => {
      return debt.amount === null || debt.amount < 0 || !debt.deadline;
    });

    if (invalidDebt) {
      alert("Every debt amount must be valid and every debt must have a deadline.");
      return;
    }

    const cleanTotalDebt = cleanDebts.reduce(
      (sum, debt) => sum + Number(debt.amount || 0),
      0
    );

    if (numericPackageValue > 0 && cleanTotalDebt > numericPackageValue) {
      const confirmOverDebt = window.confirm(
        "Debt is greater than package value. Do you still want to create this client?"
      );

      if (!confirmOverDebt) return;
    }

    setLoading(true);

    const qrToken = generateQrToken();

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        client_code: clientCode.trim() || null,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        gender: gender.trim() || null,
        date_of_birth: dateOfBirth || null,
        qr_token: qrToken,
        status: "active",
        client_source: clientSource || null,
        client_source_other:
          clientSource === "other" ? clientSourceOther.trim() || null : null,
        client_note: clientNote.trim() || null,
      })
      .select("id")
      .single();

    if (clientError) {
      alert(clientError.message);
      setLoading(false);
      return;
    }

    const clientId = client.id as string;

    const { error: packageError } = await supabase.from("session_packages").insert({
      client_id: clientId,
      total_sessions: totalSessions,
      used_sessions: 0,
      remaining_sessions: totalSessions,
      status: "active",
      starts_at: packageStartDate
        ? new Date(`${packageStartDate}T00:00:00`).toISOString()
        : null,
      expires_at: packageExpireDate
        ? new Date(`${packageExpireDate}T23:59:59`).toISOString()
        : null,
      package_name: packageName.trim() || null,
      package_value: numericPackageValue,
    });

    if (packageError) {
      alert(packageError.message);
      setLoading(false);
      return;
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from("client_purchases")
      .insert({
        client_id: clientId,
        plan_name: packageName.trim() || null,
        session_count: totalSessions,
        price: numericPackageValue,
        amount_paid: Math.max(numericPackageValue - cleanTotalDebt, 0),
        balance_due: cleanTotalDebt,
        debt_deadline: nearestDebtDeadline,
        purchase_type: purchaseType || null,
        status: "paid",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (purchaseError) {
      alert(purchaseError.message);
      setLoading(false);
      return;
    }

    if (cleanDebts.length > 0) {
      const { error: debtError } = await supabase.from("client_debts").insert(
        cleanDebts.map((debt) => ({
          client_id: clientId,
          purchase_id: purchase.id,
          title: debt.title || "Debt",
          amount: debt.amount,
          deadline: debt.deadline || null,
          note: debt.note || null,
          status: "unpaid",
        }))
      );

      if (debtError) {
        alert(debtError.message);
        setLoading(false);
        return;
      }
    }

    alert("Client created successfully!");
    router.push(`/admin/clients/${clientId}`);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-5">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  Add New Client
                </h1>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Create a client, assign sessions, set package details, and track multiple debts.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/admin/clients"
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Back to Clients
                </Link>

                <Link
                  href="/admin"
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Admin Home
                </Link>
              </div>
            </div>
          </header>

          <section className="mb-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Sessions
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-400">
                {sessions.trim() ? Number(sessions) || 0 : 0}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Package Value
              </p>
              <p className="mt-1 text-3xl font-semibold text-green-300">
                {formatMoney(numericPackageValue || 0)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Total Debt
              </p>
              <p className="mt-1 text-3xl font-semibold text-red-300">
                {formatMoney(totalDebt)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Amount Paid
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-300">
                {formatMoney(amountPaid)}
              </p>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="rounded-3xl border border-yellow-500/30 bg-black/65 p-5 shadow-2xl">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">
                    Client Profile
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Basic Information
                  </h2>
                </div>

                <p className="text-sm font-normal text-gray-400">
                  Full name is required. Other profile details are optional.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Full Name
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="text"
                    placeholder="John Smith"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Code
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="text"
                    placeholder="FXA001"
                    value={clientCode}
                    onChange={(event) => setClientCode(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Email
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="email"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Phone
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="text"
                    placeholder="416-123-4567"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Gender
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="text"
                    placeholder="Optional"
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Date of Birth
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    type="date"
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Source
                  </span>
                  <select
                    value={clientSource}
                    onChange={(event) => setClientSource(event.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-400"
                  >
                    {CLIENT_SOURCE_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        className="bg-white text-black"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {clientSource === "other" ? (
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Other Source
                    </span>
                    <input
                      className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                      type="text"
                      placeholder="Source name"
                      value={clientSourceOther}
                      onChange={(event) => setClientSourceOther(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Client Note
                </span>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal leading-6 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                  placeholder="Optional client note..."
                  value={clientNote}
                  onChange={(event) => setClientNote(event.target.value)}
                />
              </label>
            </section>

            <section className="rounded-3xl border border-yellow-500/30 bg-black/65 p-5 shadow-2xl">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">
                    Package
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Sessions and Purchase Details
                  </h2>
                </div>

                <p className="text-sm font-normal text-gray-400">
                  This creates the first active session package.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Package Name
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="text"
                    placeholder="10 Session Package"
                    value={packageName}
                    onChange={(event) => setPackageName(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Starting Sessions
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="number"
                    min="0"
                    placeholder="10"
                    value={sessions}
                    onChange={(event) => setSessions(event.target.value)}
                    required
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Package Value
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1000"
                    value={packageValue}
                    onChange={(event) => setPackageValue(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    New / Renew
                  </span>
                  <select
                    value={purchaseType}
                    onChange={(event) => setPurchaseType(event.target.value)}
                    className="w-full rounded-xl border border-yellow-400 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-300"
                  >
                    <option value="" className="bg-white text-black">
                      Select New or Renew
                    </option>
                    <option value="new" className="bg-white text-black">
                      New
                    </option>
                    <option value="renew" className="bg-white text-black">
                      Renew
                    </option>
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Start Date
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    type="date"
                    value={packageStartDate}
                    onChange={(event) => setPackageStartDate(event.target.value)}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Expire Date
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    type="date"
                    value={packageExpireDate}
                    onChange={(event) => setPackageExpireDate(event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 shadow-2xl">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">
                    Debt Tracking
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Multiple Debts and Deadlines
                  </h2>
                  <p className="mt-2 text-sm font-normal text-gray-300">
                    Add separate debt terms, amounts, and deadlines. The nearest deadline is used for admin notice.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addDebtRow}
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Add Debt
                </button>
              </div>

              <div className="space-y-4">
                {debts.map((debt, index) => (
                  <div
                    key={debt.id}
                    className="rounded-2xl border border-red-400/30 bg-black/55 p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-yellow-300">
                        Debt #{index + 1}
                      </p>

                      <button
                        type="button"
                        onClick={() => removeDebtRow(debt.id)}
                        className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <label>
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                          Debt Term / Title
                        </span>
                        <input
                          className="w-full rounded-xl border border-red-400/30 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                          type="text"
                          placeholder="Deposit, remaining balance..."
                          value={debt.title}
                          onChange={(event) =>
                            updateDebtRow(debt.id, "title", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                          Amount
                        </span>
                        <input
                          className="w-full rounded-xl border border-red-400/30 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="250"
                          value={debt.amount}
                          onChange={(event) =>
                            updateDebtRow(debt.id, "amount", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                          Deadline
                        </span>
                        <input
                          className="w-full rounded-xl border border-red-400/30 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                          type="date"
                          value={debt.deadline}
                          onChange={(event) =>
                            updateDebtRow(debt.id, "deadline", event.target.value)
                          }
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                          Note
                        </span>
                        <input
                          className="w-full rounded-xl border border-red-400/30 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                          type="text"
                          placeholder="Optional note"
                          value={debt.note}
                          onChange={(event) =>
                            updateDebtRow(debt.id, "note", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-yellow-500/30 bg-black/65 p-5 shadow-2xl">
              <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">
                    Review
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Create Client
                  </h2>

                  <p className="mt-2 text-sm font-normal text-gray-400">
                    Status is saved as paid. Debt is tracked by balance due and debt deadline.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs font-normal uppercase text-gray-400">
                        Total Debt
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-red-300">
                        {formatMoney(totalDebt)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs font-normal uppercase text-gray-400">
                        Nearest Deadline
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-orange-300">
                        {nearestDebtDeadline || "-"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs font-normal uppercase text-gray-400">
                        Paid Now
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-green-300">
                        {formatMoney(amountPaid)}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
                >
                  {loading ? "Creating Client..." : "Create Client"}
                </button>
              </div>
            </section>
          </form>
        </div>
      </div>
    </main>
  );
}