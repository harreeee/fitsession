"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../lib/checkUserRole";

type SessionLog = {
  id: string;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string;
  clients: {
    full_name: string;
    email: string | null;
  } | null;
  profiles: {
    full_name: string | null;
    role: string | null;
  } | null;
};

export default function HistoryPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [checkingRole, setCheckingRole] = useState(true);

  async function fetchLogs() {
    const { data, error } = await supabase
      .from("session_logs")
      .select(`
        id,
        status,
        message,
        remaining_after,
        scanned_at,
        clients (
          full_name,
          email
        ),
        profiles (
          full_name,
          role
        )
      `)
      .order("scanned_at", { ascending: false });

    if (error) {
      alert(error.message);
    } else {
      setLogs((data || []) as unknown as SessionLog[]);
    }

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

      setCheckingRole(false);
      await fetchLogs();
    }

    protectHistoryPage();
  }, [router]);

  const filteredLogs = logs.filter((log) => {
    const searchText = search.toLowerCase();

    return (
      (log.clients?.full_name || "")
        .toLowerCase()
        .includes(searchText) ||
      (log.clients?.email || "")
        .toLowerCase()
        .includes(searchText) ||
      (log.profiles?.full_name || "")
        .toLowerCase()
        .includes(searchText) ||
      log.status.toLowerCase().includes(searchText) ||
      new Date(log.scanned_at)
        .toLocaleString()
        .toLowerCase()
        .includes(searchText)
    );
  });

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Checking access...
          </p>
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
              href="/admin/clients"
              className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
            >
              Clients
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
              <p className="font-bold text-yellow-400">
                Loading history...
              </p>
            ) : filteredLogs.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-500/30 bg-black/50 text-3xl">
                  📋
                </div>

                <h2 className="mb-2 text-2xl font-black text-white">
                  No Session History Found
                </h2>

                <p className="text-gray-300">
                  No records match your search.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                          {log.clients?.full_name || "Unknown Client"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {log.clients?.email || "-"}
                        </td>

                        <td className="p-3 font-bold text-gray-200">
                          {log.profiles?.full_name || "Unknown Trainer"}
                        </td>

                        <td className="p-3">
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-black uppercase ${
                              log.status === "success"
                                ? "bg-green-200 text-green-900"
                                : "bg-red-200 text-red-900"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>

                        <td className="p-3 font-black text-yellow-400">
                          {log.remaining_after ?? "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {new Date(log.scanned_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}