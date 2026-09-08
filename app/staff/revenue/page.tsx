"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { staffFetch } from "@/lib/staffFetch";

type Transaction = {
  id: string;
  transaction_type: string | null;
  source: string | null;
  title: string | null;
  amount: number | string | null;
  transaction_date: string | null;
  report_group: string | null;
  counterparty: string | null;
};
type RevenueResponse = {
  month: string;
  totals: { income: number; expense: number; net: number };
  transactions: Transaction[];
};

const money = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export default function StaffRevenuePage() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void staffFetch<RevenueResponse>("/api/staff/revenue")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load revenue."));
  }, []);

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-5 md:p-8">
        <div className="mx-auto max-w-6xl pt-20 md:pt-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.4em] text-yellow-400">Read only</p><h1 className="mt-2 text-4xl font-black md:text-6xl">Revenue</h1><p className="mt-2 text-sm text-gray-400">Monthly business overview. No edit controls are available here.</p></div>
            <Link href="/staff" className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-sm font-bold text-yellow-400">Staff Tools</Link>
          </div>
          {error ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p> : null}
          {!data && !error ? <p className="mt-6 text-gray-400">Loading revenue...</p> : null}
          {data ? <>
            <p className="mt-5 text-sm text-gray-400">Month: {data.month}</p>
            <section className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-5"><p className="text-xs uppercase text-green-300">Income</p><p className="mt-2 text-3xl font-black">{money(data.totals.income)}</p></div>
              <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5"><p className="text-xs uppercase text-red-300">Expense</p><p className="mt-2 text-3xl font-black">{money(data.totals.expense)}</p></div>
              <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5"><p className="text-xs uppercase text-yellow-300">Net</p><p className="mt-2 text-3xl font-black">{money(data.totals.net)}</p></div>
            </section>
            <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05]">
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-yellow-400 text-black"><tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Description</th><th className="p-3">Source</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{data.transactions.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3 text-gray-400">{row.transaction_date || "-"}</td><td className="p-3">{row.transaction_type || "-"}</td><td className="p-3">{row.title || row.counterparty || "-"}</td><td className="p-3 text-gray-400">{row.source || row.report_group || "-"}</td><td className="p-3 text-right font-bold">{money(row.amount)}</td></tr>)}</tbody></table></div>
            </section>
          </> : null}
        </div>
      </div>
    </main>
  );
}
