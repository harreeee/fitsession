"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type SummaryLanguage = "en" | "vi";
type Priority = "high" | "medium" | "low";
type ReviewFilter =
  | "all"
  | "attention"
  | "high"
  | "low_sessions"
  | "poor_attendance"
  | "missing_notes"
  | "ai_errors";

type AttendanceCounts = {
  completed: number;
  noShow: number;
  lateCancel: number;
  cancelled: number;
  failed: number;
};

type ClientSummaryItem = {
  clientId: string;
  clientCode: string | null;
  clientName: string;
  clientStatus: string | null;
  assignedTrainer: string | null;
  assignedNutritionCoach: string | null;
  summary: string;
  priority: Priority;
  needsAttention: boolean;
  lowSessions: boolean;
  missingNotes: boolean;
  poorAttendance: boolean;
  documentedConcernMentions: number;
  remainingSessions: number | null;
  recordsReviewed: number;
  notesReviewed: number;
  latestSessionAt: string | null;
  counts: AttendanceCounts;
  aiError: string | null;
};

type BatchResponse = {
  success: boolean;
  error?: string;
  items?: ClientSummaryItem[];
  totalClients?: number;
  processed?: number;
  nextOffset?: number;
  done?: boolean;
  generatedAt?: string;
};

function formatDateTime(value: string | null | undefined) {
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

function priorityClass(priority: Priority) {
  if (priority === "high") {
    return "border-rose-400/35 bg-rose-400/10 text-rose-300";
  }

  if (priority === "medium") {
    return "border-amber-400/35 bg-amber-400/10 text-amber-300";
  }

  return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function AllClientAiReviewPage() {
  const router = useRouter();
  const cancelRequestedRef = useRef(false);

  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [language, setLanguage] = useState<SummaryLanguage>("en");
  const [activeOnly, setActiveOnly] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<ClientSummaryItem[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [processedClients, setProcessedClients] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");

  useEffect(() => {
    async function protectPage() {
      const { user, role: currentRole } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (currentRole !== "admin" && currentRole !== "manager") {
        if (
          currentRole === "trainer" ||
          currentRole === "nutrition_coach"
        ) {
          router.push("/trainer/scan");
        } else {
          router.push("/client");
        }
        return;
      }

      setRole(currentRole);
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  const metrics = useMemo(() => {
    return {
      reviewed: results.length,
      attention: results.filter((item) => item.needsAttention).length,
      highPriority: results.filter((item) => item.priority === "high").length,
      lowSessions: results.filter((item) => item.lowSessions).length,
      poorAttendance: results.filter((item) => item.poorAttendance).length,
      missingNotes: results.filter((item) => item.missingNotes).length,
      aiErrors: results.filter((item) => Boolean(item.aiError)).length,
    };
  }, [results]);

  const visibleResults = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return results.filter((item) => {
      if (filter === "attention" && !item.needsAttention) return false;
      if (filter === "high" && item.priority !== "high") return false;
      if (filter === "low_sessions" && !item.lowSessions) return false;
      if (filter === "poor_attendance" && !item.poorAttendance) return false;
      if (filter === "missing_notes" && !item.missingNotes) return false;
      if (filter === "ai_errors" && !item.aiError) return false;

      if (!cleanSearch) return true;

      return [
        item.clientName,
        item.clientCode,
        item.assignedTrainer,
        item.assignedNutritionCoach,
        item.summary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch);
    });
  }, [results, search, filter]);

  async function generateAllSummaries() {
    cancelRequestedRef.current = false;
    setGenerating(true);
    setResults([]);
    setTotalClients(0);
    setProcessedClients(0);
    setGeneratedAt(null);
    setErrorMessage("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your login session has expired. Please sign in again.");
      }

      let offset = 0;
      let finished = false;

      while (!finished && !cancelRequestedRef.current) {
        const response = await fetch("/api/ai/all-client-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rangeDays,
            language,
            activeOnly,
            offset,
            batchSize: 4,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | BatchResponse
          | null;

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error || `AI review request failed with ${response.status}.`,
          );
        }

        const nextItems = data.items || [];
        setResults((current) => [...current, ...nextItems]);
        setTotalClients(data.totalClients || 0);
        setProcessedClients(data.processed || 0);
        setGeneratedAt(data.generatedAt || new Date().toISOString());

        offset = data.nextOffset || offset + nextItems.length;
        finished = Boolean(data.done);

        if (!finished && nextItems.length === 0) {
          throw new Error(
            "The AI review stopped because the next client batch was empty.",
          );
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not generate the all-client AI review.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function cancelGeneration() {
    cancelRequestedRef.current = true;
  }

  function downloadCsv() {
    if (results.length === 0) return;

    const header = [
      "Client",
      "Client Code",
      "Priority",
      "Needs Attention",
      "Remaining Sessions",
      "Completed",
      "No-show",
      "Late Cancel",
      "Notes Reviewed",
      "Concern Mentions",
      "Assigned Trainer",
      "Assigned Nutrition Coach",
      "AI Summary",
      "AI Error",
    ];

    const rows = results.map((item) => [
      item.clientName,
      item.clientCode,
      item.priority,
      item.needsAttention ? "Yes" : "No",
      item.remainingSessions ?? "Unknown",
      item.counts.completed,
      item.counts.noShow,
      item.counts.lateCancel,
      item.notesReviewed,
      item.documentedConcernMentions,
      item.assignedTrainer,
      item.assignedNutritionCoach,
      item.summary,
      item.aiError,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fxa-ai-client-review-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="text-sm font-semibold text-violet-300">
          Checking AI review access...
        </p>
      </main>
    );
  }

  const progressPercent =
    totalClients > 0
      ? Math.min(Math.round((processedClients / totalClients) * 100), 100)
      : 0;

  return (
    <main className="min-h-screen bg-[#080808] p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-3xl border border-violet-400/25 bg-violet-400/[0.07] p-6 shadow-2xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300">
                FXA AI
              </p>
              <h1 className="mt-2 text-4xl font-semibold md:text-6xl">
                All Client Review
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
                Review every selected client in small batches. AI reads recent
                training and nutrition notes, while attendance and package
                flags are calculated directly from your app data.
              </p>
              <p className="mt-3 inline-flex rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase text-gray-300">
                Signed in as {role}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {results.length > 0 ? (
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="rounded-2xl border border-emerald-400 px-5 py-3 text-sm font-semibold uppercase text-emerald-300 transition hover:bg-emerald-400 hover:text-black"
                >
                  Export CSV
                </button>
              ) : null}

              <Link
                href="/admin"
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase text-black transition hover:bg-yellow-300"
              >
                Back to Admin
              </Link>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                Review Period
              </span>
              <select
                value={rangeDays}
                onChange={(event) => setRangeDays(Number(event.target.value))}
                disabled={generating}
                className="w-full rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm text-black outline-none disabled:opacity-60"
              >
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
                <option value={180}>Last 180 days</option>
                <option value={365}>Last 12 months</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                Output Language
              </span>
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as SummaryLanguage)
                }
                disabled={generating}
                className="w-full rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm text-black outline-none disabled:opacity-60"
              >
                <option value="en">English</option>
                <option value="vi">Vietnamese</option>
              </select>
            </label>

            <label className="flex items-end">
              <span className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => setActiveOnly(event.target.checked)}
                  disabled={generating}
                  className="h-4 w-4 accent-violet-400"
                />
                Active clients only
              </span>
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={generateAllSummaries}
                disabled={generating}
                className="w-full rounded-2xl bg-violet-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? "Reviewing..." : "Generate All"}
              </button>

              {generating ? (
                <button
                  type="button"
                  onClick={cancelGeneration}
                  className="rounded-2xl border border-red-400 px-4 py-3 text-sm font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black"
                >
                  Stop
                </button>
              ) : null}
            </div>
          </div>

          {generating || totalClients > 0 ? (
            <div className="mt-5 rounded-2xl border border-violet-400/20 bg-black/40 p-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-violet-200">
                  Reviewed {processedClients} of {totalClients} clients
                </span>
                <span className="text-gray-400">{progressPercent}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-violet-400 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-gray-500">
                The report runs in small batches so large client lists do not
                have to fit into one AI request.
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </section>

        {results.length > 0 ? (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {[
                ["Reviewed", metrics.reviewed, "text-violet-300"],
                ["Need Attention", metrics.attention, "text-amber-300"],
                ["High Priority", metrics.highPriority, "text-rose-300"],
                ["Low Sessions", metrics.lowSessions, "text-yellow-300"],
                ["Poor Attendance", metrics.poorAttendance, "text-orange-300"],
                ["Missing Notes", metrics.missingNotes, "text-cyan-300"],
                ["AI Errors", metrics.aiErrors, "text-red-300"],
              ].map(([label, value, textClass]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"
                >
                  <p className="text-xs uppercase text-gray-500">{label}</p>
                  <p className={`mt-2 text-3xl font-semibold ${textClass}`}>
                    {value}
                  </p>
                </div>
              ))}
            </section>

            <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search client, trainer, coach, summary..."
                  className="rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-400"
                />

                <div className="flex flex-wrap gap-2">
                  {[
                    ["all", "All"],
                    ["attention", "Needs Attention"],
                    ["high", "High Priority"],
                    ["low_sessions", "Low Sessions"],
                    ["poor_attendance", "Poor Attendance"],
                    ["missing_notes", "Missing Notes"],
                    ["ai_errors", "AI Errors"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value as ReviewFilter)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition ${
                        filter === value
                          ? "border-violet-400 bg-violet-400 text-black"
                          : "border-white/15 bg-black/40 text-gray-300 hover:border-violet-400 hover:text-violet-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Generated {formatDateTime(generatedAt)} · Showing {visibleResults.length} of {results.length}
              </p>
            </section>

            <section className="space-y-4">
              {visibleResults.map((item) => (
                <article
                  key={item.clientId}
                  className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-xl"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold text-white">
                          {item.clientName}
                        </h2>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${priorityClass(
                            item.priority,
                          )}`}
                        >
                          {item.priority} priority
                        </span>
                        {item.lowSessions ? (
                          <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase text-yellow-300">
                            Low sessions
                          </span>
                        ) : null}
                        {item.poorAttendance ? (
                          <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-semibold uppercase text-orange-300">
                            Attendance
                          </span>
                        ) : null}
                        {item.missingNotes ? (
                          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase text-cyan-300">
                            Missing notes
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm text-gray-400">
                        Code: {item.clientCode || "-"} · PT: {item.assignedTrainer || "Unassigned"} · NC: {item.assignedNutritionCoach || "Unassigned"}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        Latest session: {formatDateTime(item.latestSessionAt)}
                      </p>
                    </div>

                    <Link
                      href={`/admin/clients/${item.clientId}`}
                      className="shrink-0 rounded-xl bg-yellow-400 px-4 py-2.5 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                    >
                      Open Client
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                      <p className="text-xs uppercase text-gray-500">Remaining</p>
                      <p className="mt-1 text-xl font-semibold text-yellow-300">
                        {item.remainingSessions ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                      <p className="text-xs uppercase text-gray-500">Completed</p>
                      <p className="mt-1 text-xl font-semibold text-green-300">
                        {item.counts.completed}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                      <p className="text-xs uppercase text-gray-500">No-show</p>
                      <p className="mt-1 text-xl font-semibold text-red-300">
                        {item.counts.noShow}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                      <p className="text-xs uppercase text-gray-500">Late cancel</p>
                      <p className="mt-1 text-xl font-semibold text-orange-300">
                        {item.counts.lateCancel}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                      <p className="text-xs uppercase text-gray-500">Notes</p>
                      <p className="mt-1 text-xl font-semibold text-violet-300">
                        {item.notesReviewed}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                      <p className="text-xs uppercase text-gray-500">Concern mentions</p>
                      <p className="mt-1 text-xl font-semibold text-rose-300">
                        {item.documentedConcernMentions}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-violet-400/20 bg-black/45 p-5 text-sm leading-7 text-gray-200">
                    {item.summary}
                  </div>

                  {item.aiError ? (
                    <p className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-xs text-red-200">
                      AI narrative fallback used: {item.aiError}
                    </p>
                  ) : null}
                </article>
              ))}

              {visibleResults.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-10 text-center text-sm text-gray-400">
                  No clients match this filter.
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-10 text-center">
            <p className="text-lg font-semibold text-violet-300">
              No all-client report generated yet.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Choose the review settings and press Generate All.
            </p>
          </section>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-gray-600">
          AI-generated summaries must be reviewed against original session
          notes. Documented concern detection is a text flag, not a medical
          diagnosis.
        </p>
      </div>
    </main>
  );
}
