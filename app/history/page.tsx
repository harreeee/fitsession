"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getCurrentUserRole } from "../../lib/checkUserRole";

type HistoryLog = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  package_id: string | null;
  status: string | null;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string;
};

type ClientRow = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type TrainerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type DateFilter = {
  startDate: string;
  endDate: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStartOfToday() {
  return formatDateInput(new Date());
}

function getStartOfWeek() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;

  date.setDate(date.getDate() - diff);

  return formatDateInput(date);
}

function getStartOfMonth() {
  const date = new Date();
  date.setDate(1);

  return formatDateInput(date);
}

function dateToStartIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function dateToEndIso(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function getStatusClass(status: string | null) {
  const cleanStatus = (status || "").toLowerCase();

  if (cleanStatus === "success" || cleanStatus === "completed") {
    return "border-green-400/40 bg-green-400/10 text-green-300";
  }

  if (cleanStatus === "no_show" || cleanStatus === "no-show") {
    return "border-orange-400/40 bg-orange-400/10 text-orange-300";
  }

  if (cleanStatus === "cancelled" || cleanStatus === "canceled") {
    return "border-red-400/40 bg-red-400/10 text-red-300";
  }

  return "border-yellow-400/40 bg-yellow-400/10 text-yellow-300";
}

function getRoleLabel(role: string | null) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "client") return "Client";

  return "Staff";
}

export default function HistoryPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [trainers, setTrainers] = useState<TrainerRow[]>([]);

  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(getStartOfMonth());
  const [endDate, setEndDate] = useState(getStartOfToday());

  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeFilterLabel, setActiveFilterLabel] = useState("This Month");

  const clientMap = useMemo(() => {
    const map = new Map<string, ClientRow>();

    clients.forEach((client) => {
      map.set(client.id, client);

      if (client.profile_id) {
        map.set(client.profile_id, client);
      }
    });

    return map;
  }, [clients]);

  const trainerMap = useMemo(() => {
    const map = new Map<string, TrainerRow>();

    trainers.forEach((trainer) => {
      map.set(trainer.id, trainer);
    });

    return map;
  }, [trainers]);

  const filteredLogs = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    if (!cleanSearch) return logs;

    return logs.filter((log) => {
      const client = log.client_id ? clientMap.get(log.client_id) : null;
      const trainer = log.trainer_id ? trainerMap.get(log.trainer_id) : null;

      return [
        client?.full_name,
        client?.email,
        client?.phone,
        trainer?.full_name,
        trainer?.email,
        log.status,
        log.message,
        log.trainer_note,
        log.remaining_after,
        formatDateTime(log.created_at),
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch);
    });
  }, [logs, search, clientMap, trainerMap]);

  const completedCount = logs.filter(
    (log) => log.status === "success" || log.status === "completed"
  ).length;

  const uniqueClientCount = new Set(
    logs.map((log) => log.client_id).filter(Boolean)
  ).size;

  async function fetchHistory(filter?: DateFilter) {
    setLoading(true);

    const cleanStartDate = filter?.startDate ?? startDate;
    const cleanEndDate = filter?.endDate ?? endDate;

    let historyQuery = supabase
      .from("session_history")
      .select(
        "id, client_id, trainer_id, package_id, status, message, trainer_note, remaining_after, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    if (cleanStartDate) {
      historyQuery = historyQuery.gte("created_at", dateToStartIso(cleanStartDate));
    }

    if (cleanEndDate) {
      historyQuery = historyQuery.lte("created_at", dateToEndIso(cleanEndDate));
    }

    if (
      currentUserId &&
      role !== "admin" &&
      role !== "manager"
    ) {
      historyQuery = historyQuery.eq("trainer_id", currentUserId);
    }

    const [historyResult, clientsResult, trainersResult] = await Promise.all([
      historyQuery,

      supabase
        .from("clients")
        .select("id, profile_id, full_name, email, phone"),

      supabase
        .from("profiles")
        .select("id, full_name, email, role"),
    ]);

    if (historyResult.error) {
      alert(historyResult.error.message);
      setLoading(false);
      return;
    }

    if (clientsResult.error) {
      alert(clientsResult.error.message);
      setLoading(false);
      return;
    }

    if (trainersResult.error) {
      alert(trainersResult.error.message);
      setLoading(false);
      return;
    }

    setLogs((historyResult.data || []) as HistoryLog[]);
    setClients((clientsResult.data || []) as ClientRow[]);
    setTrainers((trainersResult.data || []) as TrainerRow[]);
    setLoading(false);
  }

  async function applyCustomFilter() {
    if (startDate && endDate && startDate > endDate) {
      alert("Start date cannot be after end date.");
      return;
    }

    setActiveFilterLabel("Custom Range");
    await fetchHistory({
      startDate,
      endDate,
    });
  }

  async function applyTodayFilter() {
    const today = getStartOfToday();

    setStartDate(today);
    setEndDate(today);
    setActiveFilterLabel("Today");

    await fetchHistory({
      startDate: today,
      endDate: today,
    });
  }

  async function applyThisWeekFilter() {
    const weekStart = getStartOfWeek();
    const today = getStartOfToday();

    setStartDate(weekStart);
    setEndDate(today);
    setActiveFilterLabel("This Week");

    await fetchHistory({
      startDate: weekStart,
      endDate: today,
    });
  }

  async function applyThisMonthFilter() {
    const monthStart = getStartOfMonth();
    const today = getStartOfToday();

    setStartDate(monthStart);
    setEndDate(today);
    setActiveFilterLabel("This Month");

    await fetchHistory({
      startDate: monthStart,
      endDate: today,
    });
  }

  async function applyAllTimeFilter() {
    setStartDate("");
    setEndDate("");
    setActiveFilterLabel("All Time");

    await fetchHistory({
      startDate: "",
      endDate: "",
    });
  }

  useEffect(() => {
    async function protectHistoryPage() {
      const { user, role: userRole } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (userRole === "client") {
        router.push("/client");
        return;
      }

      if (
        userRole !== "admin" &&
        userRole !== "manager" &&
        userRole !== "trainer" &&
        userRole !== "nutrition_coach"
      ) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setRole(userRole || null);
      setCurrentUserId(user.id);
      setCheckingRole(false);
    }

    protectHistoryPage();
  }, [router]);

  useEffect(() => {
    if (checkingRole) return;

    fetchHistory({
      startDate,
      endDate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingRole, currentUserId, role]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-5 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-base font-semibold text-yellow-400">
            Checking history access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Session History
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
                Filter completed sessions by date range. This page reads only
                from{" "}
                <span className="font-semibold text-yellow-400">
                  session_history
                </span>
                .
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <p className="inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-yellow-300">
                  Signed in as {getRoleLabel(role)}
                </p>

                <p className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                  Filter: {activeFilterLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => fetchHistory()}
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
              >
                Refresh
              </button>

              {role === "admin" || role === "manager" ? (
                <Link
                  href="/admin"
                  className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Back to Admin
                </Link>
              ) : (
                <Link
                  href="/trainer/scan"
                  className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Back to Scanner
                </Link>
              )}
            </div>
          </header>

          <section className="mb-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Total Records
              </p>
              <p className="mt-2 text-4xl font-semibold text-yellow-400">
                {logs.length}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Completed
              </p>
              <p className="mt-2 text-4xl font-semibold text-green-300">
                {completedCount}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Unique Clients
              </p>
              <p className="mt-2 text-4xl font-semibold text-cyan-300">
                {uniqueClientCount}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Data Source
              </p>
              <p className="mt-3 text-lg font-semibold text-yellow-300">
                session_history
              </p>
            </div>
          </section>

          <section className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyTodayFilter}
                className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
              >
                Today
              </button>

              <button
                type="button"
                onClick={applyThisWeekFilter}
                className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                This Week
              </button>

              <button
                type="button"
                onClick={applyThisMonthFilter}
                className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                This Month
              </button>

              <button
                type="button"
                onClick={applyAllTimeFilter}
                className="rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-300 transition hover:border-yellow-400 hover:text-yellow-400"
              >
                All Time
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.3fr_auto]">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                  From
                </label>

                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-2xl border border-yellow-500/25 bg-black/70 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                  To
                </label>

                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="w-full rounded-2xl border border-yellow-500/25 bg-black/70 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Search
                </label>

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search client, trainer, note, status..."
                  className="w-full rounded-2xl border border-yellow-500/25 bg-black/70 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={applyCustomFilter}
                  className="w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 lg:w-auto"
                >
                  Apply
                </button>
              </div>
            </div>
          </section>

          {loading ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-10 text-center">
              <p className="text-sm font-semibold text-yellow-400">
                Loading history...
              </p>
            </section>
          ) : filteredLogs.length === 0 ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-10 text-center">
              <p className="text-sm font-semibold text-yellow-400">
                No history found for this filter.
              </p>
            </section>
          ) : (
            <section className="overflow-hidden rounded-3xl border border-yellow-500/30 bg-black/60 shadow-2xl">
              <div className="border-b border-yellow-500/25 bg-black px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Showing {filteredLogs.length} of {logs.length} records
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1150px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-yellow-400 text-black">
                      <th className="w-[185px] px-4 py-3 text-xs font-bold uppercase">
                        Date
                      </th>
                      <th className="w-[220px] px-4 py-3 text-xs font-bold uppercase">
                        Client
                      </th>
                      <th className="w-[220px] px-4 py-3 text-xs font-bold uppercase">
                        Trainer
                      </th>
                      <th className="w-[120px] px-4 py-3 text-xs font-bold uppercase">
                        Status
                      </th>
                      <th className="w-[120px] px-4 py-3 text-xs font-bold uppercase">
                        Remaining
                      </th>
                      <th className="px-4 py-3 text-xs font-bold uppercase">
                        Message / Note
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLogs.map((log, index) => {
                      const client = log.client_id
                        ? clientMap.get(log.client_id)
                        : null;

                      const trainer = log.trainer_id
                        ? trainerMap.get(log.trainer_id)
                        : null;

                      return (
                        <tr
                          key={log.id}
                          className={`border-b border-white/10 ${
                            index % 2 === 0 ? "bg-[#101010]" : "bg-[#171717]"
                          } hover:bg-yellow-400/10`}
                        >
                          <td className="px-4 py-4 align-top text-xs text-gray-300">
                            {formatDateTime(log.created_at)}
                          </td>

                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold text-white">
                              {client?.full_name || "Unknown Client"}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {client?.email || "No email"}
                            </p>
                          </td>

                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold text-yellow-300">
                              {trainer?.full_name ||
                                trainer?.email ||
                                "Unknown Staff"}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {getRoleLabel(trainer?.role || null)}
                            </p>
                          </td>

                          <td className="px-4 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusClass(
                                log.status
                              )}`}
                            >
                              {log.status || "-"}
                            </span>
                          </td>

                          <td className="px-4 py-4 align-top text-sm font-semibold text-cyan-300">
                            {log.remaining_after === null
                              ? "-"
                              : log.remaining_after}
                          </td>

                          <td className="px-4 py-4 align-top">
                            <p className="text-sm leading-6 text-gray-300">
                              {log.message || "Session recorded."}
                            </p>

                            {log.trainer_note ? (
                              <div className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                                  Trainer Note
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-100">
                                  {log.trainer_note}
                                </p>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
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