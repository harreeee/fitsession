"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../lib/checkUserRole";

type SessionLog = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string;
  client_name: string;
  client_email: string;
  trainer_name: string;
  trainer_email: string | null;
};

type RawSessionLog = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string;
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
  return status;
}

function getStatusClass(status: string) {
  if (status === "success") {
    return "bg-green-200 text-green-900";
  }

  if (status === "manual_subtract" || status === "no_show") {
    return "bg-yellow-200 text-yellow-950";
  }

  return "bg-red-200 text-red-900";
}

function formatDateTime(value: string) {
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

export default function HistoryPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [checkingRole, setCheckingRole] = useState(true);
  const [userRole, setUserRole] = useState("");

  async function fetchLogs() {
    setLoading(true);

    const { data: logData, error: logError } = await supabase
      .from("session_logs")
      .select(`
        id,
        client_id,
        trainer_id,
        status,
        message,
        remaining_after,
        scanned_at
      `)
      .order("scanned_at", { ascending: false });

    if (logError) {
      alert(logError.message);
      setLoading(false);
      return;
    }

    const rawLogs = (logData || []) as RawSessionLog[];

    const clientIds = Array.from(
      new Set(
        rawLogs
          .map((log) => log.client_id)
          .filter((clientId): clientId is string => Boolean(clientId))
      )
    );

    const trainerIds = Array.from(
      new Set(
        rawLogs
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
        alert(clientError.message);
        setLoading(false);
        return;
      }

      clients = (clientData || []) as ClientLookup[];
    }

    if (trainerIds.length > 0) {
      const { data: trainerData, error: trainerError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", trainerIds);

      if (trainerError) {
        alert(trainerError.message);
        setLoading(false);
        return;
      }

      trainers = (trainerData || []) as TrainerLookup[];
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
          full_name: trainer.full_name,
          email: trainer.email,
        },
      ])
    );

    const mergedLogs: SessionLog[] = rawLogs.map((log) => {
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

      if (role !== "admin" && role !== "trainer") {
        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setUserRole(role || "");
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
      formatDateTime(log.scanned_at).toLowerCase().includes(searchText)
    );
  });

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">Checking access...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Session History
              </p>
            </div>

            <Link
              href={userRole === "admin" ? "/admin" : "/trainer/scan"}
              className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
            >
              {userRole === "admin" ? "Dashboard" : "Scanner"}
            </Link>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <label className="mb-2 block font-bold text-gray-200">
                Search History
              </label>

              <input
                className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                type="text"
                placeholder="Search by client, trainer, status, or date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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

                <p className="text-gray-300">No records match your search.</p>
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
                        <th className="p-3">Date / Time</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr
                          key={log.id}
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
                      key={log.id}
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

                        <div className="rounded-xl bg-white/[0.05] p-3 sm:col-span-2">
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