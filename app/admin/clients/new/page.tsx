"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";
import {
  canAddClients,
  getRoleDisplayName,
  normalizeRole,
  type AppRole,
} from "../../../../lib/role";

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

function createQrToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createClientCode() {
  const datePart = new Date()
    .toISOString()
    .slice(2, 10)
    .replaceAll("-", "");

  const randomPart = Math.floor(1000 + Math.random() * 9000);

  return `FXA-${datePart}-${randomPart}`;
}

export default function AdminNewClientPage() {
  const router = useRouter();

  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking access...");
  const [saving, setSaving] = useState(false);

  const [clientCode, setClientCode] = useState(createClientCode());
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [clientSource, setClientSource] = useState("");
  const [clientSourceOther, setClientSourceOther] = useState("");

  const [packageName, setPackageName] = useState("");
  const [totalSessions, setTotalSessions] = useState("");
  const [packageValue, setPackageValue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expireDate, setExpireDate] = useState("");
  const [purchaseType, setPurchaseType] = useState<"new" | "renew">("new");

  const roleLabel = getRoleDisplayName(userRole);

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (!canAddClients(role)) {
        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/clients");
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        router.push("/login");
        return;
      }

      setUserRole(normalizeRole(role));
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canAddClients(userRole)) {
      alert("You do not have permission to add clients.");
      return;
    }

    if (!fullName.trim()) {
      alert("Client name is required.");
      return;
    }

    if (clientSource === "other" && !clientSourceOther.trim()) {
      alert("Please enter the other client source.");
      return;
    }

    const cleanTotalSessions = totalSessions.trim()
      ? Number(totalSessions)
      : 0;

    const cleanPackageValue = packageValue.trim()
      ? Number(packageValue)
      : 0;

    const cleanAmountPaid = amountPaid.trim()
      ? Number(amountPaid)
      : cleanPackageValue;

    if (Number.isNaN(cleanTotalSessions) || cleanTotalSessions < 0) {
      alert("Total sessions must be a valid number.");
      return;
    }

    if (Number.isNaN(cleanPackageValue) || cleanPackageValue < 0) {
      alert("Package value must be a valid number.");
      return;
    }

    if (Number.isNaN(cleanAmountPaid) || cleanAmountPaid < 0) {
      alert("Amount paid must be a valid number.");
      return;
    }

    const finalAmountPaid = Math.min(cleanAmountPaid, cleanPackageValue);
    const balanceDue = Math.max(cleanPackageValue - finalAmountPaid, 0);
    const qrToken = createQrToken();

    setSaving(true);

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .insert({
        client_code: clientCode.trim() || createClientCode(),
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        gender: gender.trim() || null,
        date_of_birth: dateOfBirth || null,
        client_source: clientSource || null,
        client_source_other:
          clientSource === "other" ? clientSourceOther.trim() || null : null,
        qr_token: qrToken,
        status: "active",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (clientError) {
      alert(clientError.message);
      setSaving(false);
      return;
    }

    const clientId = clientData.id as string;

    if (cleanTotalSessions > 0) {
      const { error: packageError } = await supabase
        .from("session_packages")
        .insert({
          client_id: clientId,
          package_name: packageName.trim() || "New Package",
          total_sessions: cleanTotalSessions,
          used_sessions: 0,
          remaining_sessions: cleanTotalSessions,
          package_value: cleanPackageValue,
          starts_at: startDate
            ? new Date(`${startDate}T00:00:00`).toISOString()
            : null,
          expires_at: expireDate
            ? new Date(`${expireDate}T23:59:59`).toISOString()
            : null,
          status: "active",
          created_at: new Date().toISOString(),
        });

      if (packageError) {
        alert(packageError.message);
        setSaving(false);
        return;
      }

      const { error: purchaseError } = await supabase
        .from("client_purchases")
        .insert({
          client_id: clientId,
          plan_name: packageName.trim() || "New Package",
          session_count: cleanTotalSessions,
          price: cleanPackageValue,
          amount_paid: finalAmountPaid,
          balance_due: balanceDue,
          debt_deadline: balanceDue > 0 ? expireDate || null : null,
          purchase_type: purchaseType,
          status: "paid",
          created_at: new Date().toISOString(),
        });

      if (purchaseError) {
        alert(purchaseError.message);
        setSaving(false);
        return;
      }
    }

    alert("Client added successfully.");
    router.push(`/admin/clients/${clientId}`);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Add Client
              </h1>

              <p className="mt-3 text-sm font-normal text-gray-400 md:text-base">
                Add a new client and create the first session package.
              </p>

              <p className="mt-3 inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-normal text-yellow-300">
                Signed in as {roleLabel}
              </p>
            </div>

            <Link
              href="/admin/clients"
              className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
            >
              Back to Clients
            </Link>
          </header>

          <form
            onSubmit={createClient}
            className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur"
          >
            <section>
              <h2 className="text-2xl font-semibold text-white">
                Client Information
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Code
                  </span>
                  <input
                    value={clientCode}
                    onChange={(event) => setClientCode(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Full Name
                  </span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Phone
                  </span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Gender
                  </span>
                  <input
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Date of Birth
                  </span>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Source
                  </span>
                  <select
                    value={clientSource}
                    onChange={(event) => setClientSource(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                  >
                    {CLIENT_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {clientSource === "other" && (
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Other Source
                    </span>
                    <input
                      value={clientSourceOther}
                      onChange={(event) =>
                        setClientSourceOther(event.target.value)
                      }
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                    />
                  </label>
                )}
              </div>
            </section>

            <section className="mt-8 border-t border-white/10 pt-8">
              <h2 className="text-2xl font-semibold text-white">
                First Package
              </h2>

              <p className="mt-2 text-sm text-gray-400">
                Leave total sessions as 0 if you only want to create the client
                profile now.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Package Name
                  </span>
                  <input
                    value={packageName}
                    onChange={(event) => setPackageName(event.target.value)}
                    placeholder="Example: 10 Session Package"
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-yellow-300">
                    Total Sessions
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={totalSessions}
                    onChange={(event) => setTotalSessions(event.target.value)}
                    placeholder="Example: 10"
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Package Value
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={packageValue}
                    onChange={(event) => setPackageValue(event.target.value)}
                    placeholder="Example: 500"
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Amount Paid
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid}
                    onChange={(event) => setAmountPaid(event.target.value)}
                    placeholder="Leave blank if fully paid"
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Start Date
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Expire Date / Debt Deadline
                  </span>
                  <input
                    type="date"
                    value={expireDate}
                    onChange={(event) => setExpireDate(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Purchase Type
                  </span>
                  <select
                    value={purchaseType}
                    onChange={(event) =>
                      setPurchaseType(event.target.value as "new" | "renew")
                    }
                    className="w-full rounded-2xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                  >
                    <option value="new">New</option>
                    <option value="renew">Renew</option>
                  </select>
                </label>
              </div>
            </section>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-yellow-400 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Add Client"}
              </button>

              <Link
                href="/admin/clients"
                className="rounded-2xl border border-yellow-400 px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}