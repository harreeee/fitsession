"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../lib/checkUserRole";
import {
  canViewSessionHistory,
  getDashboardPathForRole,
  getRoleDisplayName,
  normalizeRole,
  type AppRole,
} from "../../lib/role";

type SessionLog = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  scanned_at: string;
  source: "session_logs" | "session_history";
  client_name: string;
  client_email: string;
  trainer_name: string;
  trainer_email: string | null;
};

type RawSessionLog = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  status: string | null;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string | null;
};

type RawSessionHistory = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  status: string | null;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string | null;
};

type ClientLookup = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TrainerLookup = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function getSessionStatusLabel(status: string) {
  if (status === "success") return "Session Scanned";
  if (status === "manual_subtract") return "Manual Subtract";
  if (status === "no_show") return "No-Show";
  if (status === "failed") return "Failed";
  return status || "Recorded";
}

function getStatusClass(status: string) {
  if (status === "success") {
    return "bg-green-200 text-green-900";
  }

  if (status === "manual_subtract" || status === "no_show") {
    return "bg-yellow-200 text-yellow-950";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-red-200 text-red-900";
  }

  return "bg-gray-200 text-gray-900";
}

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

function normalizeLogRows(
  sessionLogs: RawSessionLog[],
  sessionHistory: RawSessionHistory[]
): SessionLog[] {
  const logsFromSessionLogs: SessionLog[] = sessionLogs.map((log) => ({
    id: log.id,
    client_id: log.client_id,
    trainer_id: log.trainer_id,
    status: log.status || "success",
    message: log.message,
    trainer_note: null,
    remaining_after: log.remaining_after,
    scanned_at: log.scanned_at || new Date().toISOString(),
    source: "session_logs",
    client_name: "Unknown Client",
    client_email: "-",
    trainer_name: "Admin / Manual",
    trainer_email: null,
  }));

  const logsFromSessionHistory: SessionLog[] = sessionHistory.map((log) => ({
    id: log.id,
    client_id: log.client_id,
    trainer_id: log.trainer_id,
    status: log.status || "success",
    message: log.message,
    trainer_note: log.trainer_note,
    remaining_after: log.remaining_after,
    scanned_at: log.created_at || new Date().toISOString(),
    source: "session_history",
    client_name: "Unknown Client",
    client_email: "-",
    trainer_name: "Admin / Manual",
    trainer_email: null,
  }));

  return [...logsFromSessionLogs, ...logsFromSessionHistory].sort(
    (a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime()
  );
}

export default function HistoryPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [checkingRole, setCheckingRole] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);

  async function fetchLogs() {
    setLoading(true);

    const [sessionLogsResult, sessionHistoryResult] = await Promise.all([
      supabase
        .from("session_logs")
        .select("id, client_id, trainer_id, status, message, remaining_after, scanned_at")
        .order("scanned_at", { ascending: false })
        .limit(300),

      supabase
        .from("session_history")
        .select(
          "id, client_id, trainer_id, status, message, trainer_note, remaining_after, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (sessionLogsResult.error) {
      console.log("session_logs history error:", sessionLogsResult.error.message);
    }

    if (sessionHistoryResult.error) {
      console.log(
        "session_history history error:",
        sessionHistoryResult.error.message
      );
    }

    const rawSessionLogs = !sessionLogsResult.error
      ? ((sessionLogsResult.data || []) as RawSessionLog[])
      : [];

    const rawSessionHistory = !sessionHistoryResult.error
      ? ((sessionHistoryResult.data || []) as RawSessionHistory[])
      : [];

    const normalizedLogs = normalizeLogRows(rawSessionLogs, rawSessionHistory);

    const clientIds = Array.from(
      new Set(
        normalizedLogs
          .map((log) => log.client_id)
          .filter((clientId): clientId is string => Boolean(clientId))
      )
    );

    const trainerIds = Array.from(
      new Set(
        normalizedLogs
          .map((log) => log.trainer_id)
          .filter((trainerId): trainerId is string => Boolean(trainerId))
      )
    );

    let clients: ClientLookup[] = [];
    let trainers: TrainerLookup[] = [];

    if (clientIds.length > 0) {
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, full_name, email")
        .in("id", clientIds);

      if (clientError) {
        console.log("clients lookup error:", clientError.message);
      } else {
        clients = (clientData || []) as ClientLookup[];
      }
    }

    if (trainerIds.length > 0) {
      const { data: trainerData, error: trainerError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", trainerIds);

      if (trainerError) {
        console.log("trainer lookup error:", trainerError.message);
      } else {
        trainers = (trainerData || []) as TrainerLookup[];
      }
    }

    const clientMap = new Map(
      clients.map((client) => [
        client.id,
        {
          full_name: client.full_name || "Unknown Client",
          email: client.email || "-",
        },
      ])
    );

    const trainerMap = new Map(
      trainers.map((trainer) => [
        trainer.id,
        {
          full_name: trainer.full_name || null,
          email: trainer.email || null,
        },
      ])
    );

    const mergedLogs: SessionLog[] = normalizedLogs.map((log) => {
      const client = log.client_id ? clientMap.get(log.client_id) : null;
      const trainer = log.trainer_id ? trainerMap.get(log.trainer_id) : null;

      return {
        ...log,
        client_name: client?.full_name || "Unknown Client",
        client_email: client?.email || "-",
        trainer_name:
          trainer?.full_name ||
          trainer?.email ||
          (log.trainer_id ? "Trainer account removed" : "Admin / Manual"),
        trainer_email: trainer?.email || null,
      };
    });

    console.log("History page debug:", {
      sessionLogsCount: rawSessionLogs.length,
      sessionHistoryCount: rawSessionHistory.length,
      mergedCount: mergedLogs.length,
    });

    setLogs(mergedLogs);
    setLoading(false);
  }

  useEffect(() => {
    async function protectHistoryPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      const cleanRole = normalizeRole(role);

      if (!canViewSessionHistory(cleanRole)) {
        if (cleanRole === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setUserRole(cleanRole);
      setCheckingRole(false);
      await fetchLogs();
    }

    protectHistoryPage();
  }, [router]);

  const filteredLogs = logs.filter((log) => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) return true;

    return (
      log.client_name.toLowerCase().includes(searchText) ||
      log.client_email.toLowerCase().includes(searchText) ||
      log.trainer_name.toLowerCase().includes(searchText) ||
      (log.trainer_email || "").toLowerCase().includes(searchText) ||
      getSessionStatusLabel(log.status).toLowerCase().includes(searchText) ||
      log.status.toLowerCase().includes(searchText) ||
      log.source.toLowerCase().includes(searchText) ||
      formatDateTime(log.scanned_at).toLowerCase().includes(searchText)
    );
  });

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">Checking access...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-black text-yellow-400 md:text-5xl">
                FXA FITNESS
              </h1>

              <p className="text-sm uppercase tracking-[0.25em] text-gray-400">
                Session History
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Signed in as {getRoleDisplayName(userRole)}
              </p>
            </div>

            <Link
              href={getDashboardPathForRole(userRole)}
              className="rounded-xl bg-yellow-400 px-5 py-3 text-center font-black uppercase text-black transition hover:bg-yellow-300"
            >
              Dashboard
            </Link>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-yellow-500/30 bg-white/[0.06] p-4">
              <p className="text-xs uppercase tracking-widest text-gray-400">
                Total Records
              </p>
              <p className="mt-1 text-3xl font-black text-yellow-400">
                {logs.length}
              </p>
            </div>

            <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
              <p className="text-xs uppercase tracking-widest text-gray-400">
                Session Logs
              </p>
              <p className="mt-1 text-3xl font-black text-green-300">
                {logs.filter((log) => log.source === "session_logs").length}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
              <p className="text-xs uppercase tracking-widest text-gray-400">
                Session History
              </p>
              <p className="mt-1 text-3xl font-black text-blue-300">
                {logs.filter((log) => log.source === "session_history").length}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl backdrop-blur md:p-6">
            <div className="mb-6">
              <label className="mb-2 block font-bold text-gray-200">
                Search History
              </label>

              <input
                className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                type="text"
                placeholder="Search by client, trainer, status, source, or date..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {loading ? (
              <p className="font-bold text-yellow-400">Loading history...</p>
            ) : filteredLogs.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-500/30 bg-black/50 text-3xl">
                  📋
                </div>

                <h2 className="mb-2 text-2xl font-black text-white">
                  No Session History Found
                </h2>

                <p className="text-gray-300">
                  No records match your search, or the scanner is not saving
                  records into session_logs/session_history.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-yellow-500/30 text-left text-sm uppercase tracking-wide text-yellow-400">
                        <th className="p-3">Client</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Trainer</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Remaining</th>
                        <th className="p-3">Source</th>
                        <th className="p-3">Date / Time</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr
                          key={`${log.source}-${log.id}`}
                          className="border-b border-white/10 hover:bg-white/[0.04]"
                        >
                          <td className="p-3 font-black text-white">
                            {log.client_name}
                          </td>

                          <td className="p-3 text-gray-300">
                            {log.client_email}
                          </td>

                          <td className="p-3">
                            <p className="font-bold text-gray-200">
                              {log.trainer_name}
                            </p>

                            {log.trainer_email ? (
                              <p className="text-xs text-gray-500">
                                {log.trainer_email}
                              </p>
                            ) : null}
                          </td>

                          <td className="p-3">
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-black uppercase ${getStatusClass(
                                log.status
                              )}`}
                            >
                              {getSessionStatusLabel(log.status)}
                            </span>
                          </td>

                          <td className="p-3 font-black text-yellow-400">
                            {log.remaining_after ?? "-"}
                          </td>

                          <td className="p-3">
                            <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs font-bold uppercase text-gray-300">
                              {log.source}
                            </span>
                          </td>

                          <td className="p-3 text-gray-300">
                            {formatDateTime(log.scanned_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 xl:hidden">
                  {filteredLogs.map((log) => (
                    <div
                      key={`${log.source}-${log.id}`}
                      className="rounded-2xl border border-yellow-500/30 bg-black/40 p-5"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-yellow-400">
                            Client
                          </p>

                          <h2 className="text-xl font-black text-white">
                            {log.client_name}
                          </h2>

                          <p className="text-sm text-gray-400">
                            {log.client_email}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getStatusClass(
                            log.status
                          )}`}
                        >
                          {getSessionStatusLabel(log.status)}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-white/[0.05] p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                            Trainer
                          </p>

                          <p className="mt-1 font-black text-yellow-400">
                            {log.trainer_name}
                          </p>

                          {log.trainer_email ? (
                            <p className="text-xs text-gray-500">
                              {log.trainer_email}
                            </p>
                          ) : null}
                        </div>

                        <div className="rounded-xl bg-white/[0.05] p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                            Remaining
                          </p>

                          <p className="mt-1 font-black text-yellow-400">
                            {log.remaining_after ?? "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white/[0.05] p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                            Source
                          </p>

                          <p className="mt-1 font-black text-gray-200">
                            {log.source}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white/[0.05] p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                            Date / Time
                          </p>

                          <p className="mt-1 font-bold text-gray-200">
                            {formatDateTime(log.scanned_at)}
                          </p>
                        </div>
                      </div>

                      {log.message ? (
                        <p className="mt-4 rounded-xl bg-white/[0.05] p-3 text-sm text-gray-300">
                          {log.message}
                        </p>
                      ) : null}

                      {log.trainer_note ? (
                        <p className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                          {log.trainer_note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}