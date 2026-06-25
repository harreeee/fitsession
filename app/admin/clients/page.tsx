"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import {
  canDeleteClients,
  getRoleDisplayName,
  isAdminOrManager,
} from "../../../lib/role";

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
  package_value: number | null;
  created_at: string | null;
};

type PurchaseRow = {
  id: string;
  client_id: string;
  plan_name: string | null;
  session_count: number | null;
  price: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  debt_deadline: string | null;
  purchase_type: string | null;
  status: string | null;
  created_at: string | null;
};

type ClientTableRow = {
  id: string;
  clientCode: string;
  purchaseDate: string | null;
  expireDate: string | null;
  name: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: string;
  packageType: string;
  packageValue: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  purchaseType: string;
  source: string;
};

type SortKey =
  | "clientCode"
  | "purchaseDate"
  | "expireDate"
  | "name"
  | "totalSessions"
  | "usedSessions"
  | "remainingSessions"
  | "status"
  | "packageType"
  | "packageValue"
  | "amountPaid"
  | "balanceDue"
  | "purchaseType"
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
  renewal: "Renew",
};

const columns: Column[] = [
  { key: "clientCode", label: "Mã khách hàng", width: "w-[115px]" },
  { key: "purchaseDate", label: "Ngày mua", width: "w-[115px]" },
  { key: "expireDate", label: "Ngày hết hạn", width: "w-[125px]" },
  { key: "name", label: "Tên khách hàng", width: "w-[210px]" },
  {
    key: "totalSessions",
    label: "Số buổi",
    width: "w-[95px]",
    align: "right",
  },
  {
    key: "remainingSessions",
    label: "Buổi còn lại",
    width: "w-[115px]",
    align: "right",
  },
  { key: "status", label: "Trạng thái", width: "w-[120px]" },
  { key: "packageType", label: "Loại gói", width: "w-[260px]" },
  {
    key: "packageValue",
    label: "Giá trị HĐ",
    width: "w-[120px]",
    align: "right",
  },
  {
    key: "amountPaid",
    label: "Đã thanh toán",
    width: "w-[125px]",
    align: "right",
  },
  {
    key: "balanceDue",
    label: "Công nợ còn lại",
    width: "w-[135px]",
    align: "right",
  },
  { key: "purchaseType", label: "Gói tập", width: "w-[120px]" },
  { key: "source", label: "Nguồn khách", width: "w-[180px]" },
];

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) return null;

  return numericValue;
}

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

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "-";

  return `$${Number(value).toLocaleString("en-CA", {
    maximumFractionDigits: 0,
  })}`;
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

  const cleanValue = value.toLowerCase();

  return PURCHASE_TYPE_LABELS[cleanValue] || value;
}

function getStatusLabel(status: string | null, remainingSessions: number) {
  if (status && status !== "-") return status;

  return remainingSessions > 0 ? "active" : "inactive";
}

function getStatusClass(status: string) {
  const cleanStatus = status.toLowerCase();

  if (
    cleanStatus === "active" ||
    cleanStatus === "đang tập" ||
    cleanStatus === "dang tap"
  ) {
    return "border-green-400/40 bg-green-400/10 text-green-300";
  }

  if (
    cleanStatus === "inactive" ||
    cleanStatus === "hết hạn" ||
    cleanStatus === "het han" ||
    cleanStatus === "expired"
  ) {
    return "border-red-400/40 bg-red-400/10 text-red-300";
  }

  return "border-gray-400/40 bg-gray-400/10 text-gray-300";
}

function getRemainingTextClass(value: number) {
  if (value <= 0) return "text-red-300";
  if (value <= 10) return "text-orange-300";
  return "text-yellow-300";
}

function getDebtTextClass(value: number | null) {
  if (!value || value <= 0) return "text-gray-300";
  return "text-red-300";
}

function getSortValue(row: ClientTableRow, key: SortKey) {
  return row[key];
}

function renderCell(row: ClientTableRow, key: SortKey) {
  if (key === "purchaseDate") return formatDate(row.purchaseDate);
  if (key === "expireDate") return formatDate(row.expireDate);
  if (key === "packageValue") return formatMoney(row.packageValue);
  if (key === "amountPaid") return formatMoney(row.amountPaid);
  if (key === "balanceDue") return formatMoney(row.balanceDue);

  return String(row[key] ?? "-");
}

function calculateTotalSessions(
  latestPackage: SessionPackageRow | null,
  latestPurchase: PurchaseRow | null
) {
  return (
    toNumber(latestPackage?.total_sessions) ??
    toNumber(latestPurchase?.session_count) ??
    0
  );
}

function calculateRemainingSessions(
  latestPackage: SessionPackageRow | null,
  totalSessions: number
) {
  const savedRemaining = toNumber(latestPackage?.remaining_sessions);

  if (savedRemaining !== null) {
    return savedRemaining;
  }

  const usedSessions = toNumber(latestPackage?.used_sessions) ?? 0;

  return Math.max(totalSessions - usedSessions, 0);
}

function calculateUsedSessions(
  latestPackage: SessionPackageRow | null,
  totalSessions: number,
  remainingSessions: number
) {
  const savedUsed = toNumber(latestPackage?.used_sessions);

  if (savedUsed !== null) {
    return savedUsed;
  }

  return Math.max(totalSessions - remainingSessions, 0);
}

function calculatePackageValue(
  latestPackage: SessionPackageRow | null,
  latestPurchase: PurchaseRow | null
) {
  return toNumber(latestPackage?.package_value) ?? toNumber(latestPurchase?.price);
}

function calculateAmountPaid(latestPurchase: PurchaseRow | null) {
  return toNumber(latestPurchase?.amount_paid);
}

function calculateBalanceDue(
  latestPurchase: PurchaseRow | null,
  packageValue: number | null,
  amountPaid: number | null
) {
  const savedDebt = toNumber(latestPurchase?.balance_due);

  if (savedDebt !== null) {
    return savedDebt;
  }

  if (packageValue !== null && amountPaid !== null) {
    return Math.max(packageValue - amountPaid, 0);
  }

  return null;
}

export default function AdminClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [packages, setPackages] = useState<SessionPackageRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("clientCode");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking access...");
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  const roleLabel = getRoleDisplayName(userRole);
  const showDeleteButton = canDeleteClients(userRole);

  async function fetchClientsPageData() {
    setLoading(true);

    const [clientsResult, packagesResult, purchasesResult] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, client_code, full_name, status, client_source, client_source_other, created_at"
        )
        .order("client_code", { ascending: true }),

      supabase
        .from("session_packages")
        .select(
          "id, client_id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, package_value, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, session_count, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at"
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

  async function deleteClient(clientId: string, clientName: string) {
    if (!canDeleteClients(userRole)) {
      alert("Only admins can delete clients.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${clientName}? This will permanently remove the client and related records.`
    );

    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      "This cannot be undone. Are you sure you want to delete this client?"
    );

    if (!doubleConfirmed) return;

    setDeletingClientId(clientId);

    const deleteSteps = [
      {
        table: "session_history",
        action: supabase.from("session_history").delete().eq("client_id", clientId),
      },
      {
        table: "bookings",
        action: supabase.from("bookings").delete().eq("client_id", clientId),
      },
      {
        table: "client_debts",
        action: supabase.from("client_debts").delete().eq("client_id", clientId),
      },
      {
        table: "client_purchases",
        action: supabase.from("client_purchases").delete().eq("client_id", clientId),
      },
      {
        table: "session_packages",
        action: supabase.from("session_packages").delete().eq("client_id", clientId),
      },
    ];

    for (const step of deleteSteps) {
      const { error } = await step.action;

      if (error) {
        alert(`${step.table}: ${error.message}`);
        setDeletingClientId(null);
        return;
      }
    }

    const { error: clientDeleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId);

    if (clientDeleteError) {
      alert(clientDeleteError.message);
      setDeletingClientId(null);
      return;
    }

    setClients((currentClients) =>
      currentClients.filter((client) => client.id !== clientId)
    );

    setPackages((currentPackages) =>
      currentPackages.filter((packageRow) => packageRow.client_id !== clientId)
    );

    setPurchases((currentPurchases) =>
      currentPurchases.filter((purchase) => purchase.client_id !== clientId)
    );

    setDeletingClientId(null);
    alert("Client deleted.");
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

      const purchaseWithDebt = clientPurchases.find(
        (purchase) => Number(purchase.balance_due || 0) > 0
      );

      const latestPurchase =
        purchaseWithDebt || getLatestByDate(clientPurchases);

      const totalSessions = calculateTotalSessions(
        latestPackage,
        latestPurchase
      );

      const remainingSessions = calculateRemainingSessions(
        latestPackage,
        totalSessions
      );

      const usedSessions = calculateUsedSessions(
        latestPackage,
        totalSessions,
        remainingSessions
      );

      const packageValue = calculatePackageValue(latestPackage, latestPurchase);

      const amountPaid = calculateAmountPaid(latestPurchase);

      const balanceDue = calculateBalanceDue(
        latestPurchase,
        packageValue,
        amountPaid
      );

      const status = getStatusLabel(client.status, remainingSessions);

      return {
        id: client.id,
        clientCode: client.client_code || "-",
        purchaseDate:
          latestPurchase?.created_at || latestPackage?.created_at || null,
        expireDate: latestPackage?.expires_at || null,
        name: client.full_name || "-",
        totalSessions,
        usedSessions,
        remainingSessions,
        status,
        packageType:
          latestPackage?.package_name || latestPurchase?.plan_name || "-",
        packageValue,
        amountPaid,
        balanceDue,
        purchaseType: getPurchaseTypeLabel(latestPurchase?.purchase_type || null),
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
        formatDate(row.purchaseDate),
        formatDate(row.expireDate),
        row.name,
        String(row.totalSessions),
        String(row.usedSessions),
        String(row.remainingSessions),
        row.status,
        row.packageType,
        formatMoney(row.packageValue),
        formatMoney(row.amountPaid),
        formatMoney(row.balanceDue),
        row.purchaseType,
        row.source,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });

    return [...filteredRows].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      let result = 0;

      if (sortKey === "purchaseDate" || sortKey === "expireDate") {
        result =
          getTime(aValue as string | null) - getTime(bValue as string | null);
      } else if (
        sortKey === "totalSessions" ||
        sortKey === "usedSessions" ||
        sortKey === "remainingSessions" ||
        sortKey === "packageValue" ||
        sortKey === "amountPaid" ||
        sortKey === "balanceDue"
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

  const activeClients = tableRows.filter(
    (row) => row.status.toLowerCase() === "active"
  ).length;

  const totalSessions = tableRows.reduce(
    (sum, row) => sum + row.totalSessions,
    0
  );

  const totalRemainingSessions = tableRows.reduce(
    (sum, row) => sum + row.remainingSessions,
    0
  );

  const totalBalanceDue = tableRows.reduce(
    (sum, row) => sum + (row.balanceDue || 0),
    0
  );

  useEffect(() => {
    async function protectClientsPage() {
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

      setUserRole(role);
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
    <main className="fxa-scrollbar min-h-screen overflow-y-auto bg-black p-3 text-white md:p-5">
      <style jsx global>{`
        html,
        body {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }

        ::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }

        ::-webkit-scrollbar-track {
          background: #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #facc15, #ca8a04);
          border: 3px solid #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fde047, #facc15);
        }

        .fxa-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }
      `}</style>

      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4">
        <div className="mx-auto max-w-[118rem]">
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
                  Shows Số buổi, Buổi còn lại, Công nợ còn lại, and client status.
                </p>

                <p className="mt-3 inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-normal text-yellow-300">
                  Signed in as {roleLabel}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/admin"
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Back to Admin
                </Link>

                <Link
                  href="/trainer/clients"
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Staff View
                </Link>
              </div>
            </div>
          </header>

          <section className="mb-4 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Tổng khách
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-400">
                {tableRows.length}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Active
              </p>
              <p className="mt-1 text-3xl font-semibold text-green-300">
                {activeClients}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Tổng số buổi
              </p>
              <p className="mt-1 text-3xl font-semibold text-cyan-300">
                {totalSessions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Buổi còn lại
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-300">
                {totalRemainingSessions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Công nợ còn lại
              </p>
              <p className="mt-1 text-3xl font-semibold text-red-300">
                {formatMoney(totalBalanceDue)}
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
                  placeholder="Search mã khách hàng, tên khách, số buổi, công nợ, nguồn khách..."
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
                    onChange={(event) =>
                      setSortKey(event.target.value as SortKey)
                    }
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-3 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  >
                    {columns.map((column) => (
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

              <div className="fxa-scrollbar overflow-x-auto">
                <table className="w-full min-w-[1840px] table-fixed border-collapse text-left text-xs">
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

                      <th className="w-[150px] px-3 py-3 text-right text-xs font-semibold uppercase">
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

                          if (column.key === "totalSessions") {
                            extraClass = "text-cyan-300";
                          }

                          if (column.key === "usedSessions") {
                            extraClass = "text-blue-300";
                          }

                          if (column.key === "remainingSessions") {
                            extraClass = getRemainingTextClass(
                              row.remainingSessions
                            );
                          }

                          if (
                            column.key === "packageValue" ||
                            column.key === "amountPaid"
                          ) {
                            extraClass = "text-green-300";
                          }

                          if (column.key === "balanceDue") {
                            extraClass = getDebtTextClass(row.balanceDue);
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
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/clients/${row.id}`}
                              className="rounded-md bg-yellow-400 px-3 py-1.5 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                            >
                              View
                            </Link>

                            {showDeleteButton && (
                              <button
                                type="button"
                                onClick={() => deleteClient(row.id, row.name)}
                                disabled={deletingClientId === row.id}
                                className="rounded-md border border-red-400 px-3 py-1.5 text-xs font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingClientId === row.id ? "..." : "Delete"}
                              </button>
                            )}
                          </div>
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