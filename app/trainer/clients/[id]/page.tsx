"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";
import {
  getRoleDisplayName,
  normalizeRole,
  type AppRole,
} from "../../../../lib/role";

type ClientDetail = {
  id: string;
  client_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  status: string | null;
  client_note: string | null;
  client_source: string | null;
  client_source_other: string | null;
  assigned_trainer_id: string | null;
  assigned_nutrition_coach_id: string | null;
  created_at: string | null;
};

type SessionPackage = {
  id: string;
  client_id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  package_name: string | null;
  created_at: string | null;
};

type SessionHistoryRaw = {
  id: string;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string | null;
};

type SessionHistory = SessionHistoryRaw & {
  trainer_name: string;
};

type ClientNoteRaw = {
  id: string;
  client_id: string;
  trainer_id: string | null;
  note: string;
  created_at: string | null;
};

type ClientNote = ClientNoteRaw & {
  trainer_name: string;
};

type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

const CLIENT_SOURCE_LABELS: Record<string, string> = {
  coach: "Coach",
  google: "Google",
  facebook: "Facebook",
  instagram: "Instagram",
  direct_lead_walk_in: "Direct Lead / Walk In",
  referral_lead: "Referral Lead",
  other: "Other",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

function getStatusClass(status: string | null) {
  const cleanStatus = (status || "").toLowerCase();

  if (cleanStatus === "active" || cleanStatus === "success") {
    return "border-green-400/40 bg-green-400/10 text-green-300";
  }

  if (
    cleanStatus === "inactive" ||
    cleanStatus === "failed" ||
    cleanStatus === "cancelled" ||
    cleanStatus === "completed"
  ) {
    return "border-red-400/40 bg-red-400/10 text-red-300";
  }

  return "border-gray-400/40 bg-gray-400/10 text-gray-300";
}

function getRemainingTextClass(value: number) {
  if (value <= 0) return "text-red-300";
  if (value <= 10) return "text-orange-300";
  return "text-yellow-300";
}

function getPackageNumbers(packageRow: SessionPackage | null) {
  const totalSessions = Number(packageRow?.total_sessions || 0);
  const usedSessions = Number(packageRow?.used_sessions || 0);

  const remainingSessions =
    packageRow?.remaining_sessions !== null &&
    packageRow?.remaining_sessions !== undefined
      ? Number(packageRow.remaining_sessions)
      : Math.max(totalSessions - usedSessions, 0);

  return {
    totalSessions,
    usedSessions,
    remainingSessions,
  };
}

function getClientSourceLabel(source: string | null, sourceOther: string | null) {
  if (!source) return "-";

  if (source === "other") {
    return sourceOther ? `Other: ${sourceOther}` : "Other";
  }

  return CLIENT_SOURCE_LABELS[source] || source;
}

function getStaffDisplayName(profile: StaffProfile | undefined) {
  if (!profile) return "Not assigned";
  return profile.full_name || profile.email || "Unnamed Staff";
}

function getHistoryStatusLabel(status: string) {
  if (status === "success") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status || "-";
}

export default function TrainerClientDetailPage() {
  const router = useRouter();
  const params = useParams();

  const idParam = params?.id;
  const clientId = Array.isArray(idParam) ? idParam[0] : idParam;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking access...");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const roleLabel = getRoleDisplayName(userRole);

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffProfile>();

    staffProfiles.forEach((profile) => {
      map.set(profile.id, profile);
    });

    return map;
  }, [staffProfiles]);

  const activePackage = packages[0] || null;
  const packageNumbers = getPackageNumbers(activePackage);

  const assignedTrainer = client?.assigned_trainer_id
    ? staffMap.get(client.assigned_trainer_id)
    : undefined;

  const assignedNutritionCoach = client?.assigned_nutrition_coach_id
    ? staffMap.get(client.assigned_nutrition_coach_id)
    : undefined;

  async function fetchClientDetail(targetClientId: string) {
    setLoading(true);
    setPageError(null);

    const [clientResult, packageResult, historyResult, notesResult, staffResult] =
      await Promise.all([
        supabase
          .from("clients")
          .select(
            "id, client_code, full_name, email, phone, gender, date_of_birth, status, client_note, client_source, client_source_other, assigned_trainer_id, assigned_nutrition_coach_id, created_at",
          )
          .eq("id", targetClientId)
          .maybeSingle(),

        supabase
          .from("session_packages")
          .select(
            "id, client_id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, created_at",
          )
          .eq("client_id", targetClientId)
          .order("created_at", { ascending: false }),

        supabase
          .from("session_history")
          .select(
            "id, trainer_id, status, message, trainer_note, remaining_after, created_at",
          )
          .eq("client_id", targetClientId)
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("client_notes")
          .select("id, client_id, trainer_id, note, created_at")
          .eq("client_id", targetClientId)
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["admin", "manager", "trainer", "nutrition_coach"])
          .order("full_name", { ascending: true }),
      ]);

    if (clientResult.error) {
      setPageError(clientResult.error.message);
      setLoading(false);
      return;
    }

    if (!clientResult.data) {
      setClient(null);
      setPageError("Client not found or you do not have access to this client.");
      setLoading(false);
      return;
    }

    if (packageResult.error) {
      setPageError(packageResult.error.message);
      setLoading(false);
      return;
    }

    if (historyResult.error) {
      console.error("session_history error:", historyResult.error.message);
    }

    if (notesResult.error) {
      console.error("client_notes error:", notesResult.error.message);
    }

    if (staffResult.error) {
      setPageError(staffResult.error.message);
      setLoading(false);
      return;
    }

    const cleanStaffProfiles = (staffResult.data || []) as StaffProfile[];
    const cleanHistory = (historyResult.data || []) as SessionHistoryRaw[];
    const cleanNotes = (notesResult.data || []) as ClientNoteRaw[];

    const nameMap = new Map(
      cleanStaffProfiles.map((profile) => [
        profile.id,
        profile.full_name || profile.email || "Unknown Staff",
      ]),
    );

    setClient(clientResult.data as ClientDetail);
    setPackages((packageResult.data || []) as SessionPackage[]);
    setStaffProfiles(cleanStaffProfiles);

    setSessionHistory(
      cleanHistory.map((log) => ({
        ...log,
        trainer_name:
          log.trainer_id && nameMap.get(log.trainer_id)
            ? nameMap.get(log.trainer_id)!
            : "Admin / Manual",
      })),
    );

    setClientNotes(
      cleanNotes.map((note) => ({
        ...note,
        trainer_name:
          note.trainer_id && nameMap.get(note.trainer_id)
            ? nameMap.get(note.trainer_id)!
            : "Staff",
      })),
    );

    setLoading(false);
  }

  async function addClientNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clientId || !currentUserId) return;

    const cleanNote = newNote.trim();

    if (!cleanNote) {
      alert("Please write a note first.");
      return;
    }

    setSavingNote(true);

    const { error } = await supabase.from("client_notes").insert({
      client_id: clientId,
      trainer_id: currentUserId,
      note: cleanNote,
      created_at: new Date().toISOString(),
    });

    if (error) {
      alert(error.message);
      setSavingNote(false);
      return;
    }

    setNewNote("");
    await fetchClientDetail(clientId);
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

      if (
        role !== "trainer" &&
        role !== "nutrition_coach" &&
        role !== "admin" &&
        role !== "manager"
      ) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      if (!clientId) {
        setPageError("Missing client ID.");
        setCheckingRole(false);
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserRole(normalizeRole(role));
      setCheckingRole(false);
      await fetchClientDetail(clientId);
    }

    protectPage();
  }, [router, clientId]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            Loading client detail...
          </p>
        </div>
      </main>
    );
  }

  if (pageError || !client) {
    return (
      <main className="min-h-screen bg-black p-4 text-white md:p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-5 md:p-8">
          <div className="mx-auto max-w-5xl rounded-3xl border border-red-400/30 bg-red-400/10 p-6">
            <h1 className="text-2xl font-semibold text-red-300">
              Unable to load client
            </h1>
            <p className="mt-2 text-sm text-gray-300">
              {pageError || "Client not found."}
            </p>
            <Link
              href="/trainer/clients"
              className="mt-5 inline-block rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300"
            >
              Back to Clients
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-5">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4">
        <div className="mx-auto max-w-7xl">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  {client.full_name}
                </h1>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Staff client detail. Financial information is hidden.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-normal text-yellow-300">
                    {client.client_code || "No code"}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusClass(
                      client.status,
                    )}`}
                  >
                    {client.status || "-"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-normal text-gray-300">
                    Signed in as {roleLabel}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {(userRole === "admin" || userRole === "manager") && (
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="rounded-xl border border-purple-400 px-4 py-2 text-center text-xs font-semibold uppercase text-purple-300 transition hover:bg-purple-400 hover:text-black"
                  >
                    Admin Detail
                  </Link>
                )}

                <Link
                  href="/trainer/clients"
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Back to Clients
                </Link>
              </div>
            </div>
          </header>

          <section className="mb-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <h2 className="text-xl font-semibold text-white">
                Client Information
              </h2>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <InfoCard label="Email" value={client.email || "-"} />
                <InfoCard label="Phone" value={client.phone || "-"} />
                <InfoCard label="Gender" value={client.gender || "-"} />
                <InfoCard
                  label="Date of Birth"
                  value={formatDate(client.date_of_birth)}
                />
                <InfoCard
                  label="Client Source"
                  value={getClientSourceLabel(
                    client.client_source,
                    client.client_source_other,
                  )}
                />
                <InfoCard
                  label="Created"
                  value={formatDate(client.created_at)}
                />
              </div>

              {client.client_note ? (
                <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">
                    Admin Client Note
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-100/90">
                    {client.client_note}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <h2 className="text-xl font-semibold text-white">
                Assigned Staff
              </h2>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-purple-300">
                    Personal Trainer
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {getStaffDisplayName(assignedTrainer)}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
                    Nutrition Coach
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {getStaffDisplayName(assignedNutritionCoach)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-5 grid gap-4 md:grid-cols-4">
            <MetricCard
              label="Total Sessions"
              value={String(packageNumbers.totalSessions)}
              tone="yellow"
            />
            <MetricCard
              label="Used Sessions"
              value={String(packageNumbers.usedSessions)}
              tone="cyan"
            />
            <MetricCard
              label="Remaining"
              value={String(packageNumbers.remainingSessions)}
              tone="orange"
            />
            <MetricCard
              label="Package Status"
              value={activePackage?.status || client.status || "-"}
              tone="gray"
            />
          </section>

          <section className="mb-5 rounded-3xl border border-yellow-500/25 bg-white/[0.06] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Package
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  {activePackage?.package_name || "No active package name"}
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  Staff view shows package timing and sessions only. Money and
                  debt are hidden.
                </p>
              </div>

              <span
                className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusClass(
                  activePackage?.status || client.status,
                )}`}
              >
                {activePackage?.status || client.status || "-"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <InfoCard label="Start Date" value={formatDate(activePackage?.starts_at)} />
              <InfoCard label="Expire Date" value={formatDate(activePackage?.expires_at)} />
              <InfoCard
                label="Remaining Sessions"
                value={String(packageNumbers.remainingSessions)}
                valueClassName={getRemainingTextClass(
                  packageNumbers.remainingSessions,
                )}
              />
            </div>
          </section>

          <section className="mb-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-green-400/25 bg-green-400/10 p-5">
              <h2 className="text-xl font-semibold text-white">
                Add Staff Note
              </h2>
              <p className="mt-2 text-sm text-gray-300">
                Notes are visible in this staff client detail page.
              </p>

              <form onSubmit={addClientNote} className="mt-4">
                <textarea
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  placeholder="Write training, nutrition, or client follow-up note..."
                  className="min-h-36 w-full rounded-2xl border border-green-400/30 bg-black/70 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-500 focus:border-green-300"
                />

                <button
                  type="submit"
                  disabled={savingNote}
                  className="mt-3 rounded-2xl bg-green-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingNote ? "Saving..." : "Save Note"}
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <h2 className="text-xl font-semibold text-white">
                Staff Notes
              </h2>

              {clientNotes.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-gray-400">
                  No staff notes yet.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {clientNotes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-2xl border border-white/10 bg-black/40 p-4"
                    >
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm font-semibold text-yellow-300">
                          {note.trainer_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(note.created_at)}
                        </p>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">
                        {note.note}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-yellow-500/25 bg-white/[0.06] p-5">
            <h2 className="text-xl font-semibold text-white">
              Recent Sessions
            </h2>

            {sessionHistory.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-gray-400">
                No session history yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {sessionHistory.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <span
                          className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusClass(
                            log.status,
                          )}`}
                        >
                          {getHistoryStatusLabel(log.status)}
                        </span>
                        <p className="mt-2 text-sm text-gray-400">
                          Staff: {log.trainer_name}
                        </p>
                      </div>

                      <p className="text-sm text-gray-500">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>

                    <p className="mt-3 text-sm text-gray-300">
                      Remaining After: {" "}
                      <span className="font-semibold text-yellow-300">
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
                        <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">
                          Session Note
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-100/90">
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

function InfoCard({
  label,
  value,
  valueClassName = "text-white",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "yellow" | "cyan" | "orange" | "gray";
}) {
  const toneClass = {
    yellow: "text-yellow-300",
    cyan: "text-cyan-300",
    orange: "text-orange-300",
    gray: "text-gray-200",
  }[tone];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </p>
      <p className={`mt-3 text-4xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}