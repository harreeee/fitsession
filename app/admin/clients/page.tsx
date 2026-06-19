"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ClientRow = {
  id: string;
  full_name: string;
  status: string | null;
  created_at: string | null;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  package_name: string | null;
  package_value: number | null;
  created_at: string | null;
};

type PurchaseRow = {
  id: string;
  client_id: string;
  plan_name: string | null;
  session_count: number | null;
  price: number | null;
  status: string | null;
  created_at: string | null;
};

type ClientTableRow = {
  id: string;
  purchaseDate: string | null;
  startDate: string | null;
  expireDate: string | null;
  name: string;
  totalSessions: number;
  remainingSessions: number;
  packageType: string;
  packageValue: number | null;
  status: string;
};

type SortKey =
  | "purchaseDate"
  | "startDate"
  | "expireDate"
  | "name"
  | "totalSessions"
  | "remainingSessions"
  | "packageType"
  | "packageValue"
  | "status";

type SortDirection = "asc" | "desc";

const sortableColumns: {
  key: SortKey;
  label: string;
  align?: "left" | "right";
}[] = [
  { key: "purchaseDate", label: "Date of Purchase" },
  { key: "startDate", label: "Start Date" },
  { key: "expireDate", label: "Date Expire" },
  { key: "name", label: "Name" },
  { key: "totalSessions", label: "Total Session", align: "right" },
  { key: "remainingSessions", label: "Remaining", align: "right" },
  { key: "packageType", label: "Package Type" },
  { key: "packageValue", label: "Package Value", align: "right" },
  { key: "status", label: "Status" },
];

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "-";

  return `$${Number(value).toFixed(2)}`;
}

function getTime(value: string | null) {
  if (!value) return 0;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
}

function getLatestByDate<T extends { created_at: string | null }>(rows: T[]) {
  if (rows.length === 0) return null;

  return [...rows].sort(
    (a, b) => getTime(b.created_at) - getTime(a.created_at)
  )[0];
}

function compareString(a: string, b: string) {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function compareNumbers(a: number | null, b: number | null) {
  const safeA = a ?? -1;
  const safeB = b ?? -1;

  return safeA - safeB;
}

function getSortValue(row: ClientTableRow, key: SortKey) {
  return row[key];
}

export default function AdminClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [packages, setPackages] = useState<SessionPackageRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("purchaseDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking access...");
  const [userRole, setUserRole] = useState("");

  const canManageClients = userRole === "admin";

  async function fetchClientsPageData() {
    setLoading(true);

    const [clientsResult, packagesResult, purchasesResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, full_name, status, created_at")
        .order("created_at", { ascending: false }),

      supabase
        .from("session_packages")
        .select(
          "id, client_id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, package_value, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("client_purchases")
        .select("id, client_id, plan_name, session_count, price, status, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (clientsResult.error) {
      alert(clientsResult.error.message);
      setLoading(false);
      return;
    }

    if (packagesResult.error) {
      alert(packagesResult.error.message);
      setLoading(false);
      return;
    }

    if (purchasesResult.error) {
      alert(purchasesResult.error.message);
      setLoading(false);
      return;
    }

    setClients((clientsResult.data || []) as ClientRow[]);
    setPackages((packagesResult.data || []) as SessionPackageRow[]);
    setPurchases((purchasesResult.data || []) as PurchaseRow[]);

    setLoading(false);
  }

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  const tableRows = useMemo<ClientTableRow[]>(() => {
  return clients.map((client) => {
    const clientPackages = packages.filter(
      (packageRow) => packageRow.client_id === client.id
    );

    const clientPurchases = purchases.filter(
      (purchase) => purchase.client_id === client.id
    );

    const latestPackage = getLatestByDate(clientPackages);

    const confirmedPurchases = clientPurchases.filter(
      (purchase) => purchase.status === "confirmed"
    );

    const latestConfirmedPurchase =
      getLatestByDate(confirmedPurchases) || getLatestByDate(clientPurchases);

    return {
      id: client.id,
      purchaseDate:
        latestConfirmedPurchase?.created_at || latestPackage?.created_at || null,
      startDate: latestPackage?.starts_at || latestPackage?.created_at || null,
      expireDate: latestPackage?.expires_at || null,
      name: client.full_name || "-",
      totalSessions: latestPackage?.total_sessions ?? 0,
      remainingSessions: latestPackage?.remaining_sessions ?? 0,
      packageType:
        latestPackage?.package_name || latestConfirmedPurchase?.plan_name || "-",
      packageValue:
        typeof latestPackage?.package_value === "number"
          ? latestPackage.package_value
          : typeof latestConfirmedPurchase?.price === "number"
          ? latestConfirmedPurchase.price
          : null,
      status: client.status || "-",
    };
  });
}, [clients, packages, purchases]);

  const filteredAndSortedRows = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    const filteredRows = tableRows.filter((row) => {
      if (!searchText) return true;

      return [
        row.name,
        row.status,
        row.packageType,
        formatDate(row.purchaseDate),
        formatDate(row.startDate),
        formatDate(row.expireDate),
        String(row.totalSessions),
        String(row.remainingSessions),
        formatMoney(row.packageValue),
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });

    return [...filteredRows].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      let result = 0;

      if (
        sortKey === "purchaseDate" ||
        sortKey === "startDate" ||
        sortKey === "expireDate"
      ) {
        result = getTime(aValue as string | null) - getTime(bValue as string | null);
      } else if (
        sortKey === "totalSessions" ||
        sortKey === "remainingSessions" ||
        sortKey === "packageValue"
      ) {
        result = compareNumbers(aValue as number | null, bValue as number | null);
      } else {
        result = compareString(String(aValue || ""), String(bValue || ""));
      }

      return sortDirection === "asc" ? result : -result;
    });
  }, [tableRows, search, sortKey, sortDirection]);

  const activeClients = tableRows.filter((row) => row.status === "active").length;

  const totalRemainingSessions = tableRows.reduce(
    (sum, row) => sum + row.remainingSessions,
    0
  );

  const lowSessionClients = tableRows.filter(
    (row) => row.remainingSessions > 0 && row.remainingSessions <= 10
  ).length;

  useEffect(() => {
    async function protectClientsPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role === "client") {
        setCheckingMessage("Redirecting to client portal...");
        router.push("/client");
        return;
      }

      if (role !== "admin" && role !== "trainer" && role !== "nutrition_coach") {
        setCheckingMessage("Redirecting to login...");
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setUserRole(role || "");
      setCheckingRole(false);
      await fetchClientsPageData();
    }

    protectClientsPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">{checkingMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Client Directory
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                View package dates, sessions, package value, and client status.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={userRole === "admin" ? "/admin" : "/trainer/scan"}
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                {userRole === "admin" ? "Back to Admin" : "Back to Scanner"}
              </Link>

              {canManageClients ? (
                <>
                  <Link
                    href="/admin/import-clients"
                    className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                  >
                    Import Excel
                  </Link>

                  <Link
                    href="/admin/clients/new"
                    className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
                  >
                    Add Client
                  </Link>
                </>
              ) : null}
            </div>
          </header>

          <section className="mb-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Total Clients
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {tableRows.length}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Active
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {activeClients}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Sessions Left
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {totalRemainingSessions}
              </p>
            </div>

            <div className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-red-300">
                Low Sessions
              </p>
              <p className="mt-3 text-4xl font-black text-red-300">
                {lowSessionClients}
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
            <div className="grid gap-4 md:grid-cols-[1fr_260px]">
              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Search
                </label>

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, package, status, sessions..."
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-widest text-gray-400">
                  Sort Mobile
                </label>

                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as SortKey)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  >
                    {sortableColumns.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      setSortDirection((current) =>
                        current === "asc" ? "desc" : "asc"
                      )
                    }
                    className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black uppercase text-black transition hover:bg-yellow-300"
                  >
                    {sortDirection === "asc" ? "Asc" : "Desc"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <p className="font-black text-yellow-400">Loading clients...</p>
          ) : filteredAndSortedRows.length === 0 ? (
            <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-8 text-center shadow-2xl backdrop-blur">
              <p className="font-black text-yellow-400">No clients found.</p>
            </section>
          ) : (
            <>
              <section className="hidden overflow-hidden rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] shadow-2xl backdrop-blur xl:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-yellow-400 text-black">
                      <tr>
                        {sortableColumns.map((column) => (
                          <th
                            key={column.key}
                            className={`p-4 ${
                              column.align === "right" ? "text-right" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSort(column.key)}
                              className={`flex w-full items-center gap-2 font-black uppercase tracking-wide ${
                                column.align === "right"
                                  ? "justify-end"
                                  : "justify-start"
                              }`}
                            >
                              <span>{column.label}</span>
                              <span>
                                {sortKey === column.key
                                  ? sortDirection === "asc"
                                    ? "▲"
                                    : "▼"
                                  : "↕"}
                              </span>
                            </button>
                          </th>
                        ))}

                        <th className="p-4 text-right font-black uppercase tracking-wide">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredAndSortedRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-white/10 transition hover:bg-yellow-400/5"
                        >
                          <td className="p-4 font-bold text-gray-300">
                            {formatDate(row.purchaseDate)}
                          </td>

                          <td className="p-4 font-bold text-gray-300">
                            {formatDate(row.startDate)}
                          </td>

                          <td className="p-4 font-bold text-gray-300">
                            {formatDate(row.expireDate)}
                          </td>

                          <td className="p-4">
                            <Link
                              href={`/admin/clients/${row.id}`}
                              className="font-black text-yellow-400 hover:text-yellow-300"
                            >
                              {row.name}
                            </Link>
                          </td>

                          <td className="p-4 text-right font-black text-white">
                            {row.totalSessions}
                          </td>

                          <td className="p-4 text-right font-black text-yellow-400">
                            {row.remainingSessions}
                          </td>

                          <td className="p-4 font-bold text-gray-200">
                            {row.packageType}
                          </td>

                          <td className="p-4 text-right font-black text-green-300">
                            {formatMoney(row.packageValue)}
                          </td>

                          <td className="p-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                                row.status === "active"
                                  ? "bg-green-500/20 text-green-300"
                                  : "bg-red-500/20 text-red-300"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>

                          <td className="p-4 text-right">
                            <Link
                              href={`/admin/clients/${row.id}`}
                              className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-black uppercase text-black transition hover:bg-yellow-300"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 xl:hidden">
                {filteredAndSortedRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur"
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-yellow-400">
                          Client
                        </p>

                        <h2 className="mt-1 text-2xl font-black text-white">
                          {row.name}
                        </h2>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                          row.status === "active"
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">
                          Date of Purchase
                        </p>
                        <p className="font-black text-white">
                          {formatDate(row.purchaseDate)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">Start Date</p>
                        <p className="font-black text-white">
                          {formatDate(row.startDate)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">Date Expire</p>
                        <p className="font-black text-white">
                          {formatDate(row.expireDate)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">Total Session</p>
                        <p className="font-black text-yellow-400">
                          {row.totalSessions}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">Remaining</p>
                        <p className="font-black text-yellow-400">
                          {row.remainingSessions}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">Package Type</p>
                        <p className="font-black text-white">
                          {row.packageType}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/40 p-3">
                        <p className="font-bold text-gray-400">Package Value</p>
                        <p className="font-black text-green-300">
                          {formatMoney(row.packageValue)}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/admin/clients/${row.id}`}
                      className="mt-5 block rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-black uppercase text-black transition hover:bg-yellow-300"
                    >
                      View Client
                    </Link>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}