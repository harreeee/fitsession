"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";
import {
  getRoleDisplayName,
  isAdminOrManager,
  normalizeRole,
  type AppRole,
} from "../../../../lib/role";

type ClientRow = {
  id: string;
  client_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  client_source: string | null;
  client_source_other: string | null;
  sales_person_id: string | null;
  assigned_trainer_id: string | null;
  assigned_nutrition_coach_id: string | null;
  created_at: string | null;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  package_name: string | null;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type ClientPurchaseRow = {
  id: string;
  client_id: string;
  plan_name: string | null;
  session_count: number | null;
  price: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  purchase_type: string | null;
  status: string | null;
  debt_deadline: string | null;
  created_at: string | null;
};

type StaffProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type InactiveClientRow = {
  client: ClientRow;
  packageRow: SessionPackageRow | null;
  latestPurchase: ClientPurchaseRow | null;
  activeDebt: number;
  salesPersonName: string;
  trainerName: string;
  nutritionCoachName: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `$${Number(value).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getPackageNumbers(packageRow: SessionPackageRow | null) {
  const totalSessions = Number(packageRow?.total_sessions || 0);
  const usedSessions = Number(packageRow?.used_sessions || 0);
  const remainingSessions =
    packageRow?.remaining_sessions !== null &&
    packageRow?.remaining_sessions !== undefined
      ? Number(packageRow.remaining_sessions)
      : Math.max(totalSessions - usedSessions, 0);

  return {
    totalSessions,
    usedSessions,
    remainingSessions,
  };
}

function getPurchaseTypeLabel(value: string | null | undefined) {
  const type = (value || "").toLowerCase();
  if (type === "new") return "New";
  if (type === "renew" || type === "renewal") return "Renew";
  if (type === "debt") return "Debt";
  return "-";
}

export default function AdminInactiveClientsPage() {
  const router = useRouter();

  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking inactive client access...",
  );
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [packages, setPackages] = useState<SessionPackageRow[]>([]);
  const [purchases, setPurchases] = useState<ClientPurchaseRow[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [search, setSearch] = useState("");
  const [reactivatingClientId, setReactivatingClientId] = useState<string | null>(
    null,
  );

  const roleLabel = getRoleDisplayName(userRole);
  const canReactivate = userRole === "admin" || userRole === "manager";

  async function fetchInactiveClients() {
    setLoading(true);

    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, client_code, full_name, email, phone, status, client_source, client_source_other, sales_person_id, assigned_trainer_id, assigned_nutrition_coach_id, created_at",
      )
      .eq("status", "inactive")
      .order("full_name", { ascending: true });

    if (clientError) {
      alert(clientError.message);
      setLoading(false);
      return;
    }

    const cleanClients = (clientData || []) as ClientRow[];
    setClients(cleanClients);

    if (cleanClients.length === 0) {
      setPackages([]);
      setPurchases([]);
      setStaffProfiles([]);
      setLoading(false);
      return;
    }

    const clientIds = cleanClients.map((client) => client.id);

    const staffIds = Array.from(
      new Set(
        cleanClients
          .flatMap((client) => [
            client.sales_person_id,
            client.assigned_trainer_id,
            client.assigned_nutrition_coach_id,
          ])
          .filter((staffId): staffId is string => Boolean(staffId)),
      ),
    );

    const [packageResult, purchaseResult, staffResult] = await Promise.all([
      supabase
        .from("session_packages")
        .select(
          "id, client_id, package_name, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, created_at",
        )
        .in("client_id", clientIds)
        .order("created_at", { ascending: false }),

      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, session_count, price, amount_paid, balance_due, purchase_type, status, debt_deadline, created_at",
        )
        .in("client_id", clientIds)
        .order("created_at", { ascending: false }),

      staffIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (packageResult.error) {
      console.error("inactive packages error:", packageResult.error.message);
      setPackages([]);
    } else {
      setPackages((packageResult.data || []) as SessionPackageRow[]);
    }

    if (purchaseResult.error) {
      console.error("inactive purchases error:", purchaseResult.error.message);
      setPurchases([]);
    } else {
      setPurchases((purchaseResult.data || []) as ClientPurchaseRow[]);
    }

    if (staffResult.error) {
      console.error("inactive staff error:", staffResult.error.message);
      setStaffProfiles([]);
    } else {
      setStaffProfiles((staffResult.data || []) as StaffProfile[]);
    }

    setLoading(false);
  }

  async function reactivateClient(client: ClientRow) {
    if (!canReactivate) {
      alert("You do not have permission to reactivate clients.");
      return;
    }

    const confirmed = window.confirm(
      `Reactivate ${client.full_name}?\n\nThis client will move back to Active Client Management.`,
    );

    if (!confirmed) return;

    setReactivatingClientId(client.id);

    const { error } = await supabase
      .from("clients")
      .update({ status: "active" })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setReactivatingClientId(null);
      return;
    }

    await fetchInactiveClients();
    setReactivatingClientId(null);
  }

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (!isAdminOrManager(role)) {
        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/clients");
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

      setUserRole(normalizeRole(role));
      setCheckingRole(false);
      await fetchInactiveClients();
    }

    protectPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const inactiveRows = useMemo<InactiveClientRow[]>(() => {
    const packageMap = new Map<string, SessionPackageRow>();
    const latestPurchaseMap = new Map<string, ClientPurchaseRow>();
    const activeDebtMap = new Map<string, number>();
    const staffMap = new Map<string, StaffProfile>();

    packages.forEach((packageRow) => {
      if (!packageMap.has(packageRow.client_id)) {
        packageMap.set(packageRow.client_id, packageRow);
      }
    });

    purchases.forEach((purchase) => {
      if (!latestPurchaseMap.has(purchase.client_id)) {
        latestPurchaseMap.set(purchase.client_id, purchase);
      }

      const balanceDue = Number(purchase.balance_due || 0);
      if (balanceDue > 0) {
        activeDebtMap.set(
          purchase.client_id,
          Number(activeDebtMap.get(purchase.client_id) || 0) + balanceDue,
        );
      }
    });

    staffProfiles.forEach((profile) => {
      staffMap.set(profile.id, profile);
    });

    return clients.map((client) => ({
      client,
      packageRow: packageMap.get(client.id) || null,
      latestPurchase: latestPurchaseMap.get(client.id) || null,
      activeDebt: Number(activeDebtMap.get(client.id) || 0),
      salesPersonName:
        (client.sales_person_id && staffMap.get(client.sales_person_id)?.full_name) ||
        "-",
      trainerName:
        (client.assigned_trainer_id &&
          staffMap.get(client.assigned_trainer_id)?.full_name) ||
        "-",
      nutritionCoachName:
        (client.assigned_nutrition_coach_id &&
          staffMap.get(client.assigned_nutrition_coach_id)?.full_name) ||
        "-",
    }));
  }, [clients, packages, purchases, staffProfiles]);

  const filteredRows = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    if (!cleanSearch) return inactiveRows;

    return inactiveRows.filter((row) => {
      const packageNumbers = getPackageNumbers(row.packageRow);
      const values = [
        row.client.full_name,
        row.client.client_code,
        row.client.email,
        row.client.phone,
        row.client.client_source,
        row.client.client_source_other,
        row.packageRow?.package_name,
        row.latestPurchase?.plan_name,
        row.salesPersonName,
        row.trainerName,
        row.nutritionCoachName,
        String(packageNumbers.remainingSessions),
      ];

      return values.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(cleanSearch),
      );
    });
  }, [inactiveRows, search]);

  const totalInactive = inactiveRows.length;
  const totalInactiveDebt = inactiveRows.reduce(
    (sum, row) => sum + row.activeDebt,
    0,
  );
  const inactiveWithSessions = inactiveRows.filter((row) => {
    const numbers = getPackageNumbers(row.packageRow);
    return numbers.remainingSessions > 0;
  }).length;
  const inactiveWithDebt = inactiveRows.filter((row) => row.activeDebt > 0).length;

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
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Inactive Clients
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-normal leading-6 text-gray-400 md:text-base">
                This page keeps inactive clients separated from the main client
                management page. Reactivate a client here when they return.
              </p>

              <p className="mt-3 inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-normal text-yellow-300">
                Signed in as {roleLabel}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/admin/clients"
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
              >
                Active Clients
              </Link>

              <button
                type="button"
                onClick={fetchInactiveClients}
                disabled={loading}
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </header>

          <section className="mb-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Total Inactive
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {totalInactive}
              </p>
            </div>

            <div className="rounded-[2rem] border border-cyan-500/30 bg-cyan-500/10 p-5 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                Still Have Sessions
              </p>
              <p className="mt-3 text-4xl font-semibold text-cyan-300">
                {inactiveWithSessions}
              </p>
            </div>

            <div className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-5 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                With Active Debt
              </p>
              <p className="mt-3 text-4xl font-semibold text-red-300">
                {inactiveWithDebt}
              </p>
            </div>

            <div className="rounded-[2rem] border border-green-500/30 bg-green-500/10 p-5 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                Total Debt
              </p>
              <p className="mt-3 text-4xl font-semibold text-green-300">
                {formatMoney(totalInactiveDebt)}
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Search Inactive Clients
                </span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, code, phone, email, package, PT, NC..."
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />
              </label>

              <div className="rounded-2xl border border-yellow-400/25 bg-black/40 px-4 py-3 text-sm text-gray-300">
                Showing{" "}
                <span className="font-semibold text-yellow-300">
                  {filteredRows.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-yellow-300">
                  {totalInactive}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-4 shadow-2xl backdrop-blur md:p-5">
            {loading ? (
              <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                Loading inactive clients...
              </p>
            ) : filteredRows.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                No inactive clients found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1500px] w-full border-separate border-spacing-y-3 text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-widest text-gray-400">
                      <th className="px-4 py-2 font-semibold">Client</th>
                      <th className="px-4 py-2 font-semibold">Contact</th>
                      <th className="px-4 py-2 font-semibold">Package</th>
                      <th className="px-4 py-2 font-semibold">Sessions</th>
                      <th className="px-4 py-2 font-semibold">Debt</th>
                      <th className="px-4 py-2 font-semibold">Sale / PT / NC</th>
                      <th className="px-4 py-2 font-semibold">Purchase</th>
                      <th className="px-4 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.map((row) => {
                      const packageNumbers = getPackageNumbers(row.packageRow);

                      return (
                        <tr key={row.client.id}>
                          <td className="rounded-l-2xl border-y border-l border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p className="font-semibold text-white">
                              {row.client.full_name}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              Code: {row.client.client_code || "-"}
                            </p>
                            <span className="mt-3 inline-flex rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-300">
                              {row.client.status || "inactive"}
                            </span>
                          </td>

                          <td className="border-y border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p className="text-gray-200">
                              {row.client.phone || "-"}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {row.client.email || "-"}
                            </p>
                            <p className="mt-2 text-xs text-gray-500">
                              Source: {row.client.client_source_other || row.client.client_source || "-"}
                            </p>
                          </td>

                          <td className="border-y border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p className="font-semibold text-yellow-300">
                              {row.packageRow?.package_name || "-"}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              Start: {formatDate(row.packageRow?.starts_at)}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              Expire: {formatDate(row.packageRow?.expires_at)}
                            </p>
                          </td>

                          <td className="border-y border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p className="text-cyan-300">
                              Total: {packageNumbers.totalSessions}
                            </p>
                            <p className="mt-1 text-gray-300">
                              Used: {packageNumbers.usedSessions}
                            </p>
                            <p className="mt-1 font-semibold text-yellow-300">
                              Left: {packageNumbers.remainingSessions}
                            </p>
                          </td>

                          <td className="border-y border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p
                              className={
                                row.activeDebt > 0
                                  ? "font-semibold text-red-300"
                                  : "font-semibold text-green-300"
                              }
                            >
                              {formatMoney(row.activeDebt)}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {row.activeDebt > 0 ? "Active debt" : "No debt"}
                            </p>
                          </td>

                          <td className="border-y border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p className="text-xs text-gray-400">Sale</p>
                            <p className="text-yellow-300">{row.salesPersonName}</p>
                            <p className="mt-2 text-xs text-gray-400">PT</p>
                            <p className="text-purple-300">{row.trainerName}</p>
                            <p className="mt-2 text-xs text-gray-400">NC</p>
                            <p className="text-green-300">{row.nutritionCoachName}</p>
                          </td>

                          <td className="border-y border-white/10 bg-black/45 px-4 py-4 align-top">
                            <p className="text-yellow-300">
                              {getPurchaseTypeLabel(row.latestPurchase?.purchase_type)}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {row.latestPurchase?.plan_name || "-"}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {formatDate(row.latestPurchase?.created_at)}
                            </p>
                          </td>

                          <td className="rounded-r-2xl border-y border-r border-white/10 bg-black/45 px-4 py-4 align-top text-right">
                            <div className="flex flex-col gap-2">
                              <Link
                                href={`/admin/clients/${row.client.id}`}
                                className="rounded-xl border border-yellow-400/70 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
                              >
                                View
                              </Link>

                              {canReactivate ? (
                                <button
                                  type="button"
                                  onClick={() => reactivateClient(row.client)}
                                  disabled={reactivatingClientId === row.client.id}
                                  className="rounded-xl bg-green-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {reactivatingClientId === row.client.id
                                    ? "Reactivating..."
                                    : "Reactivate"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
