"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ClientRow = {
  id: string;
  client_code: string | null;
  full_name: string;
  status: string | null;
  client_source: string | null;
  client_source_other: string | null;
  created_at: string | null;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  package_name: string | null;
  created_at: string | null;
};

type PurchaseRow = {
  id: string;
  client_id: string;
  plan_name: string | null;
  session_count: number | null;
  purchase_type: string | null;
  status: string | null;
  created_at: string | null;
};

type ClientTableRow = {
  id: string;
  clientCode: string;
  name: string;
  purchaseDate: string | null;
  startDate: string | null;
  expireDate: string | null;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  packageName: string;
  purchaseType: string;
  status: string;
  source: string;
};

type SortKey =
  | "clientCode"
  | "name"
  | "purchaseDate"
  | "startDate"
  | "expireDate"
  | "totalSessions"
  | "usedSessions"
  | "remainingSessions"
  | "packageName"
  | "purchaseType"
  | "status"
  | "source";

type SortDirection = "asc" | "desc";

type Column = {
  key: SortKey;
  label: string;
  width: string;
  align?: "left" | "right" | "center";
};

const CLIENT_SOURCE_LABELS: Record<string, string> = {
  coach: "Coach",
  google: "Google",
  facebook: "Facebook",
  instagram: "Instagram",
  direct_lead_walk_in: "Walk In",
  referral_lead: "Referral",
  other: "Other",
};

const PURCHASE_TYPE_LABELS: Record<string, string> = {
  new: "New",
  renew: "Renew",
};

const columns: Column[] = [
  { key: "clientCode", label: "Code", width: "w-[90px]" },
  { key: "name", label: "Client", width: "w-[230px]" },
  { key: "purchaseDate", label: "Purchase", width: "w-[115px]" },
  { key: "startDate", label: "Start", width: "w-[115px]" },
  { key: "expireDate", label: "Expire", width: "w-[115px]" },
  { key: "totalSessions", label: "Total", width: "w-[85px]", align: "right" },
  { key: "usedSessions", label: "Used", width: "w-[85px]", align: "right" },
  { key: "remainingSessions", label: "Left", width: "w-[85px]", align: "right" },
  { key: "packageName", label: "Package", width: "w-[240px]" },
  { key: "purchaseType", label: "Type", width: "w-[100px]" },
  { key: "status", label: "Status", width: "w-[120px]" },
  { key: "source", label: "Source", width: "w-[150px]" },
];

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
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
  return (a ?? -1) - (b ?? -1);
}

function getClientSourceLabel(
  source: string | null,
  sourceOther: string | null
) {
  if (!source) return "-";

  if (source === "other") {
    return sourceOther ? `Other: ${sourceOther}` : "Other";
  }

  return CLIENT_SOURCE_LABELS[source] || source;
}

function getPurchaseTypeLabel(value: string | null) {
  if (!value) return "-";

  return PURCHASE_TYPE_LABELS[value] || value;
}

function getStatusClass(status: string) {
  if (status === "active") {
    return "border-green-400/40 bg-green-400/10 text-green-300";
  }

  if (status === "inactive") {
    return "border-red-400/40 bg-red-400/10 text-red-300";
  }

  return "border-gray-400/40 bg-gray-400/10 text-gray-300";
}

function getRemainingTextClass(value: number) {
  if (value <= 0) return "text-red-300";
  if (value <= 10) return "text-orange-300";
  return "text-yellow-300";
}

function getSortValue(row: ClientTableRow, key: SortKey) {
  return row[key];
}

function renderCell(row: ClientTableRow, key: SortKey) {
  if (key === "purchaseDate") return formatDate(row.purchaseDate);
  if (key === "startDate") return formatDate(row.startDate);
  if (key === "expireDate") return formatDate(row.expireDate);

  return String(row[key] ?? "-");
}

export default function TrainerClientsPage() {
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

  async function fetchClientsPageData() {
    setLoading(true);

    const [clientsResult, packagesResult, purchasesResult] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, client_code, full_name, status, client_source, client_source_other, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("session_packages")
        .select(
          "id, client_id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, session_count, purchase_type, status, created_at"
        )
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

      const paidPurchases = clientPurchases.filter(
        (purchase) => purchase.status === "paid" || purchase.status === "confirmed"
      );

      const latestPurchase =
        getLatestByDate(paidPurchases) || getLatestByDate(clientPurchases);

      return {
        id: client.id,
        clientCode: client.client_code || "-",
        name: client.full_name || "-",
        purchaseDate:
          latestPurchase?.created_at || latestPackage?.created_at || null,
        startDate: latestPackage?.starts_at || latestPackage?.created_at || null,
        expireDate: latestPackage?.expires_at || null,
        totalSessions:
          latestPackage?.total_sessions ?? latestPurchase?.session_count ?? 0,
        usedSessions: latestPackage?.used_sessions ?? 0,
        remainingSessions: latestPackage?.remaining_sessions ?? 0,
        packageName:
          latestPackage?.package_name || latestPurchase?.plan_name || "-",
        purchaseType: getPurchaseTypeLabel(latestPurchase?.purchase_type || null),
        status: client.status || "-",
        source: getClientSourceLabel(
          client.client_source,
          client.client_source_other
        ),
      };
    });
  }, [clients, packages, purchases]);

  const filteredAndSortedRows = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    const filteredRows = tableRows.filter((row) => {
      if (!searchText) return true;

      return [
        row.clientCode,
        row.name,
        row.status,
        row.packageName,
        row.purchaseType,
        row.source,
        formatDate(row.purchaseDate),
        formatDate(row.startDate),
        formatDate(row.expireDate),
        String(row.totalSessions),
        String(row.usedSessions),
        String(row.remainingSessions),
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
        result =
          getTime(aValue as string | null) - getTime(bValue as string | null);
      } else if (
        sortKey === "totalSessions" ||
        sortKey === "usedSessions" ||
        sortKey === "remainingSessions"
      ) {
        result = compareNumbers(
          aValue as number | null,
          bValue as number | null
        );
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

      if (
  role !== "trainer" &&
  role !== "nutrition_coach" &&
  role !== "admin" &&
  role !== "manager"
) {
  if (role === "client") {
    router.push("/client");
    return;
  }

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
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-5">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4">
        <div className="mx-auto max-w-[108rem]">
          <header className="mb-4 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  Client Directory
                </h1>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Staff view only. Package value, payment, paid amount, and debt
                  are hidden.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={userRole === "admin" ? "/admin" : "/trainer/scan"}
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  {userRole === "admin" ? "Back to Admin" : "Back to Scanner"}
                </Link>

                {userRole === "admin" ? (
                  <Link
                    href="/admin/clients"
                    className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                  >
                    Admin Client Tools
                  </Link>
                ) : null}
              </div>
            </div>
          </header>

          <section className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">Total</p>
              <p className="mt-1 text-3xl font-semibold text-yellow-400">
                {tableRows.length}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">Active</p>
              <p className="mt-1 text-3xl font-semibold text-green-300">
                {activeClients}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Sessions Left
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-300">
                {totalRemainingSessions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Low Sessions
              </p>
              <p className="mt-1 text-3xl font-semibold text-orange-300">
                {lowSessionClients}
              </p>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
              <div>
                <label className="mb-1 block text-xs font-normal uppercase text-gray-400">
                  Search
                </label>

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search code, client, package, type, source, status..."
                  className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-normal uppercase text-gray-400">
                  Sort
                </label>

                <div className="grid grid-cols-[1fr_74px] gap-2">
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as SortKey)}
                    className="w-full rounded-xl border border-white/15 bg-white px-3 py-3 text-sm font-normal text-black outline-none focus:border-yellow-400"
                  >
                    {columns.map((column) => (
                      <option
                        key={column.key}
                        value={column.key}
                        className="bg-white text-black"
                      >
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
                    className="rounded-xl bg-yellow-400 px-3 py-3 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                  >
                    {sortDirection === "asc" ? "Asc" : "Desc"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center">
              <p className="text-sm font-normal text-yellow-400">
                Loading clients...
              </p>
            </section>
          ) : filteredAndSortedRows.length === 0 ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center">
              <p className="text-sm font-normal text-yellow-400">
                No clients found.
              </p>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-yellow-500/30 bg-black/65 shadow-2xl">
              <div className="border-b border-yellow-500/30 bg-black px-4 py-3">
                <p className="text-xs font-normal uppercase tracking-widest text-yellow-400">
                  Showing {filteredAndSortedRows.length} of {tableRows.length} clients
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1450px] table-fixed border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-yellow-400 text-black">
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className={`${column.width} border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase last:border-r-0 ${
                            column.align === "right"
                              ? "text-right"
                              : column.align === "center"
                              ? "text-center"
                              : "text-left"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(column.key)}
                            className={`flex w-full items-center gap-1 whitespace-nowrap ${
                              column.align === "right"
                                ? "justify-end"
                                : column.align === "center"
                                ? "justify-center"
                                : "justify-start"
                            }`}
                          >
                            <span>{column.label}</span>
                            <span className="text-[10px]">
                              {sortKey === column.key
                                ? sortDirection === "asc"
                                  ? "▲"
                                  : "▼"
                                : "↕"}
                            </span>
                          </button>
                        </th>
                      ))}

                      <th className="w-[90px] px-3 py-3 text-right text-xs font-semibold uppercase">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`border-b border-white/10 ${
                          index % 2 === 0 ? "bg-[#101010]" : "bg-[#171717]"
                        } hover:bg-yellow-400/10`}
                      >
                        {columns.map((column) => {
                          const value = renderCell(row, column.key);

                          let extraClass = "text-gray-200";

                          if (column.key === "clientCode") {
                            extraClass = "text-yellow-300";
                          }

                          if (column.key === "name") {
                            extraClass = "text-white";
                          }

                          if (column.key === "remainingSessions") {
                            extraClass = getRemainingTextClass(row.remainingSessions);
                          }

                          return (
                            <td
                              key={column.key}
                              className={`${column.width} border-r border-white/15 px-3 py-3 text-xs font-normal last:border-r-0 ${
                                column.align === "right"
                                  ? "text-right"
                                  : column.align === "center"
                                  ? "text-center"
                                  : "text-left"
                              } ${extraClass}`}
                            >
                              {column.key === "status" ? (
                                <span
                                  className={`inline-block rounded-md border px-2 py-1 text-xs font-normal uppercase ${getStatusClass(
                                    row.status
                                  )}`}
                                >
                                  {row.status}
                                </span>
                              ) : (
                                <span className="block truncate">{value}</span>
                              )}
                            </td>
                          );
                        })}

                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/trainer/clients/${row.id}`}
                            className="rounded-md bg-yellow-400 px-3 py-1.5 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
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
          )}
        </div>
      </div>
    </main>
  );
}