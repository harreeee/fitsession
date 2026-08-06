"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";

type SummaryLanguage = "en" | "vi";

type SummaryResponse = {
  success: boolean;
  summary?: string;
  error?: string;
  generatedAt?: string;
  recordsReviewed?: number;
  notesReviewed?: number;
  rangeDays?: number;
  remainingSessions?: number | null;
  counts?: {
    completed: number;
    noShow: number;
    lateCancel: number;
    cancelled: number;
    failed: number;
  };
};

type ClientAiSummaryProps = {
  clientId: string;
  clientName: string;
};

function formatGeneratedAt(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ClientAiSummary({
  clientId,
  clientName,
}: ClientAiSummaryProps) {
  const [rangeDays, setRangeDays] = useState(30);
  const [language, setLanguage] = useState<SummaryLanguage>("en");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummaryResponse | null>(null);

  async function generateSummary() {
    if (!clientId) {
      setResult({ success: false, error: "Client ID is missing." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your login session has expired. Please sign in again.");
      }

      const response = await fetch("/api/ai/client-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId,
          rangeDays,
          language,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | SummaryResponse
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Request failed with ${response.status}.`);
      }

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not generate the AI summary.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6 rounded-[2rem] border border-violet-400/35 bg-violet-400/10 p-6 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">
            FXA AI
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            AI Client Assessment
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Summarize documented attendance, progress, recurring concerns, and
            next-session priorities for {clientName}. This tool reads recent
            session notes only and does not change client data.
          </p>
        </div>

        <div className="rounded-2xl border border-violet-400/25 bg-black/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Safety
          </p>
          <p className="mt-1 text-sm text-violet-200">
            Review before use. Not medical advice.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-violet-300">
            Review Period
          </span>

          <select
            value={rangeDays}
            onChange={(event) => setRangeDays(Number(event.target.value))}
            disabled={loading}
            className="w-full rounded-2xl border border-violet-400/35 bg-white px-4 py-3 text-sm text-black outline-none focus:border-violet-300 disabled:opacity-60"
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-violet-300">
            Output Language
          </span>

          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as SummaryLanguage)
            }
            disabled={loading}
            className="w-full rounded-2xl border border-violet-400/35 bg-white px-4 py-3 text-sm text-black outline-none focus:border-violet-300 disabled:opacity-60"
          >
            <option value="en">English</option>
            <option value="vi">Vietnamese</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={generateSummary}
            disabled={loading}
            className="w-full rounded-2xl bg-violet-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {loading ? "Generating..." : "Generate Summary"}
          </button>
        </div>
      </div>

      {result?.success && result.summary ? (
        <div className="mt-5 rounded-3xl border border-violet-400/25 bg-black/55 p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">
                Generated Assessment
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {formatGeneratedAt(result.generatedAt)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-gray-300">
                {result.recordsReviewed ?? 0} records
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-gray-300">
                {result.notesReviewed ?? 0} notes
              </span>
              <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-yellow-300">
                Remaining: {result.remainingSessions ?? "Unknown"}
              </span>
            </div>
          </div>

          {result.counts ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
                <p className="text-xs uppercase text-gray-400">Completed</p>
                <p className="mt-1 text-xl font-semibold text-green-300">
                  {result.counts.completed}
                </p>
              </div>

              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3">
                <p className="text-xs uppercase text-gray-400">No-show</p>
                <p className="mt-1 text-xl font-semibold text-red-300">
                  {result.counts.noShow}
                </p>
              </div>

              <div className="rounded-2xl border border-orange-400/20 bg-orange-400/10 p-3">
                <p className="text-xs uppercase text-gray-400">Late cancel</p>
                <p className="mt-1 text-xl font-semibold text-orange-300">
                  {result.counts.lateCancel}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-400/20 bg-gray-400/10 p-3">
                <p className="text-xs uppercase text-gray-400">Cancelled</p>
                <p className="mt-1 text-xl font-semibold text-gray-300">
                  {result.counts.cancelled}
                </p>
              </div>

              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3">
                <p className="text-xs uppercase text-gray-400">Failed</p>
                <p className="mt-1 text-xl font-semibold text-red-300">
                  {result.counts.failed}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/50 p-5 text-sm leading-7 text-gray-200">
            {result.summary}
          </div>

          <p className="mt-4 text-xs leading-5 text-gray-500">
            AI-generated summary based on available records. Verify important
            details against the original session notes before making coaching,
            business, or client-care decisions.
          </p>
        </div>
      ) : null}

      {result && !result.success ? (
        <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          {result.error || "Could not generate the AI summary."}
        </div>
      ) : null}
    </section>
  );
}