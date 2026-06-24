"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type ClientDetail = {
  id: string;
  client_code: string | null;
  full_name: string;
  gender: string | null;
  status: string | null;
  client_note: string | null;
  client_source: string | null;
  client_source_other: string | null;
  created_at: string | null;
};

type SessionPackage = {
  id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  package_name: string | null;
  created_at: string | null;
};

type SessionHistory = {
  id: string;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string | null;
  trainer_name: string;
};

type TrainerProfile = {
  id: string;
  full_name: string | null;
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

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function getStatusClass(status: string | null) {
  if (status === "active" || status === "success" || status === "booked") {
    return "bg-green-500/20 text-green-300";
  }

  if (status === "inactive" || status === "failed" || status === "cancelled") {
    return "bg-red-500/20 text-red-300";
  }

  return "bg-gray-500/20 text-gray-300";
}

function getRemainingClass(value: number | null | undefined) {
  const safeValue = value ?? 0;

  if (safeValue <= 0) return "text-red-300";
  if (safeValue <= 10) return "text-orange-300";
  return "text-yellow-400";
}

export default function TrainerClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [history, setHistory] = useState<SessionHistory[]>([]);

  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking access...");
  const [loading, setLoading] = useState(true);

  async function fetchSessionHistory() {
    const { data: historyData, error: historyError } = await supabase
      .from("session_history")
      .select(
        "id, trainer_id, status, message, trainer_note, remaining_after, created_at"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (historyError) {
      console.error(historyError.message);
      setHistory([]);
      return;
    }

    const rawHistory = (historyData || []) as Omit<
      SessionHistory,
      "trainer_name"
    >[];

    const trainerIds = Array.from(
      new Set(
        rawHistory
          .map((log) => log.trainer_id)
          .filter((trainerId): trainerId is string => Boolean(trainerId))
      )
    );

    if (trainerIds.length === 0) {
      setHistory(
        rawHistory.map((log) => ({
          ...log,
          trainer_name: "Unknown Trainer",
        }))
      );
      return;
    }

    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);

    const trainerNameMap = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((profile) => [
        profile.id,
        profile.full_name || "Unknown Trainer",
      ])
    );

    setHistory(
      rawHistory.map((log) => ({
        ...log,
        trainer_name:
          log.trainer_id && trainerNameMap.get(log.trainer_id)
            ? trainerNameMap.get(log.trainer_id)!
            : "Unknown Trainer",
      }))
    );
  }

  async function fetchClientDetail() {
    setLoading(true);

    const [clientResult, packageResult] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, client_code, full_name, gender, status, client_note, client_source, client_source_other, created_at"
        )
        .eq("id", clientId)
        .maybeSingle(),

      supabase
        .from("session_packages")
        .select(
          "id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, created_at"
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

    if (clientResult.error) {
      alert(clientResult.error.message);
      setLoading(false);
      return;
    }

    if (!clientResult.data) {
      setClient(null);
      setLoading(false);
      return;
    }

    if (packageResult.error) {
      alert(packageResult.error.message);
      setLoading(false);
      return;
    }

    const cleanClient = clientResult.data as ClientDetail;

    setClient(cleanClient);
    setNoteText(cleanClient.client_note || "");
    setPackages((packageResult.data || []) as SessionPackage[]);

    await fetchSessionHistory();

    setLoading(false);
  }

  async function saveClientNote() {
    if (!client) return;

    setSavingNote(true);

    const { error } = await supabase.rpc("staff_update_client_note", {
      p_client_id: client.id,
      p_client_note: noteText,
    });

    if (error) {
      alert(error.message);
      setSavingNote(false);
      return;
    }

    alert("Client note saved.");
    await fetchClientDetail();
    setSavingNote(false);
  }

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role === "client") {
        setCheckingMessage("Redirecting to client portal...");
        router.push("/client");
        return;
      }

      if (role !== "admin" && role !== "trainer" && role !== "nutrition_coach") {
        setCheckingMessage("Redirecting to login...");
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingRole(false);
      await fetchClientDetail();
    }

    protectPage();
  }, [router, clientId]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">{checkingMessage}</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">Loading client...</p>
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">Client not found.</p>

          <Link
            href="/trainer/clients"
            className="mt-5 inline-block rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black"
          >
            Back to Clients
          </Link>
        </div>
      </main>
    );
  }

  const activePackage =
    packages.find((packageRow) => packageRow.status === "active") ||
    packages[0] ||
    null;

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Client Detail
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Staff view for client sessions, package dates, notes, and recent
                training history.
              </p>
            </div>

            <Link
              href="/trainer/clients"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Clients
            </Link>
          </header>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Client
                </p>

                <h2 className="mt-2 text-4xl font-black text-yellow-400">
                  {client.full_name}
                </h2>

                <p className="mt-2 text-sm font-bold text-gray-400">
                  Client Code:{" "}
                  <span className="text-white">{client.client_code || "-"}</span>
                </p>
              </div>

              <span
                className={`w-fit rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide ${getStatusClass(
                  client.status
                )}`}
              >
                {client.status || "-"}
              </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Gender
                </p>
                <p className="mt-2 font-black text-white">
                  {client.gender || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Source
                </p>
                <p className="mt-2 font-black text-yellow-300">
                  {getClientSourceLabel(
                    client.client_source,
                    client.client_source_other
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Created
                </p>
                <p className="mt-2 font-black text-white">
                  {formatDate(client.created_at)}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Total Sessions
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {activePackage?.total_sessions ?? 0}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Used Sessions
              </p>
              <p className="mt-3 text-4xl font-black text-white">
                {activePackage?.used_sessions ?? 0}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Remaining
              </p>
              <p
                className={`mt-3 text-4xl font-black ${getRemainingClass(
                  activePackage?.remaining_sessions
                )}`}
              >
                {activePackage?.remaining_sessions ?? 0}
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-black">Current Package</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Package
                </p>
                <p className="mt-2 font-black text-white">
                  {activePackage?.package_name || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Start Date
                </p>
                <p className="mt-2 font-black text-white">
                  {formatDate(activePackage?.starts_at || null)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Expire Date
                </p>
                <p className="mt-2 font-black text-white">
                  {formatDate(activePackage?.expires_at || null)}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-yellow-400/10 p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-black text-yellow-300">
              Client Note
            </h2>

            <p className="mt-2 text-sm font-medium text-yellow-100/80">
              Add training goals, injuries, preferences, reminders, or anything
              the staff should know.
            </p>

            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              className="mt-5 min-h-40 w-full rounded-2xl border border-yellow-400/30 bg-black/70 p-4 text-sm font-semibold leading-6 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              placeholder="Add client note..."
            />

            <button
              type="button"
              onClick={saveClientNote}
              disabled={savingNote}
              className="mt-4 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingNote ? "Saving..." : "Save Note"}
            </button>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-black">Recent Sessions</h2>

            {history.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm font-bold text-gray-400">
                No session history yet.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {history.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-black text-yellow-400">
                          {log.status}
                        </p>

                        <p className="mt-1 text-sm font-bold text-gray-400">
                          Trainer: {log.trainer_name}
                        </p>
                      </div>

                      <p className="text-sm font-bold text-gray-400">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>

                    <p className="mt-2 text-sm font-bold text-gray-300">
                      Remaining After:{" "}
                      <span className="text-yellow-400">
                        {log.remaining_after ?? "-"}
                      </span>
                    </p>

                    {log.message ? (
                      <p className="mt-2 text-sm text-gray-400">
                        {log.message}
                      </p>
                    ) : null}

                    {log.trainer_note ? (
                      <div className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                        <p className="text-xs font-black uppercase tracking-widest text-yellow-400">
                          Session Note
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-yellow-100">
                          {log.trainer_note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}