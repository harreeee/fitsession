"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { staffFetch } from "@/lib/staffFetch";

type ClientRow = {
  id: string;
  clientCode: string | null;
  fullName: string;
  status: string | null;
  trainerName: string | null;
  nutritionCoachName: string | null;
};

export default function StaffClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void staffFetch<{ clients: ClientRow[] }>("/api/staff/clients")
      .then((data) => setClients(data.clients))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load clients."));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => `${client.clientCode || ""} ${client.fullName} ${client.trainerName || ""} ${client.nutritionCoachName || ""}`.toLowerCase().includes(q));
  }, [clients, search]);

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-5 md:p-8">
        <div className="mx-auto max-w-6xl pt-20 md:pt-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.4em] text-yellow-400">Read only</p><h1 className="mt-2 text-4xl font-black md:text-6xl">Clients List</h1><p className="mt-2 text-sm text-gray-400">Full roster with assigned trainer and nutrition coach. No client editing.</p></div><Link href="/staff" className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-sm font-bold text-yellow-400">Staff Tools</Link></div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client or coach..." className="mt-5 w-full rounded-2xl border border-white/15 bg-black/70 px-4 py-3 text-sm outline-none focus:border-yellow-400" />
          {error ? <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p> : null}
          <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05]"><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-yellow-400 text-black"><tr><th className="p-3">Code</th><th className="p-3">Client</th><th className="p-3">Status</th><th className="p-3">Trainer</th><th className="p-3">Nutrition Coach</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3 text-yellow-300">{row.clientCode || "-"}</td><td className="p-3 font-bold">{row.fullName}</td><td className="p-3 text-gray-400">{row.status || "-"}</td><td className="p-3">{row.trainerName || "Unassigned"}</td><td className="p-3">{row.nutritionCoachName || "Unassigned"}</td></tr>)}</tbody></table></div></div>
          <p className="mt-3 text-xs text-gray-500">Showing {rows.length} of {clients.length} clients.</p>
        </div>
      </div>
    </main>
  );
}
