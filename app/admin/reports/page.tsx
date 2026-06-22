"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type ReportType = "revenue" | "sessions" | "clients";

export default function AdminReportsPage() {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [downloading, setDownloading] = useState<ReportType | null>(null);
  const [error, setError] = useState("");

  async function downloadReport(type: ReportType) {
    setError("");
    setDownloading(type);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("You are not logged in. Please log in again.");
        setDownloading(null);
        return;
      }

      const response = await fetch(
        `/api/admin/reports/${type}?year=${year}&month=${month}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Export failed.");
        setDownloading(null);
        return;
      }

      const blob = await response.blob();

      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] ??
        `FXA-${type}-${year}-${String(month).padStart(2, "0")}.csv`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while exporting.");
    }

    setDownloading(null);
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Monthly Reports
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Export monthly revenue, session history, and client management
                data.
              </p>
            </div>

            <Link
              href="/admin"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Admin
            </Link>
          </div>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-black uppercase tracking-widest text-gray-400">
                  Year
                </span>
                <input
                  type="number"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black px-4 py-3 font-bold text-white outline-none transition focus:border-yellow-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-black uppercase tracking-widest text-gray-400">
                  Month
                </span>
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black px-4 py-3 font-bold text-white outline-none transition focus:border-yellow-400"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (monthNumber) => (
                      <option key={monthNumber} value={monthNumber}>
                        {monthNumber.toString().padStart(2, "0")}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            {error && (
              <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-bold text-red-300">
                {error}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <button
                onClick={() => downloadReport("revenue")}
                disabled={downloading !== null}
                className="rounded-2xl bg-yellow-400 px-5 py-4 font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "revenue"
                  ? "Exporting..."
                  : "Export Revenue CSV"}
              </button>

              <button
                onClick={() => downloadReport("sessions")}
                disabled={downloading !== null}
                className="rounded-2xl bg-yellow-400 px-5 py-4 font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "sessions"
                  ? "Exporting..."
                  : "Export Sessions CSV"}
              </button>

              <button
                onClick={() => downloadReport("clients")}
                disabled={downloading !== null}
                className="rounded-2xl bg-yellow-400 px-5 py-4 font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "clients"
                  ? "Exporting..."
                  : "Export Clients CSV"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}