"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type TrainerSessionHistory = {
  id: string;
  client_id: string;
  client_name: string;
  client_email: string | null;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string;
};

type Trainer = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
  total_sessions_this_month: number;
  recent_session_history: TrainerSessionHistory[];
};

export default function AdminTrainersPage() {
  const router = useRouter();

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [expandedTrainerId, setExpandedTrainerId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  }

  async function fetchTrainers() {
    setLoading(true);
    setMessage("");

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/admin/trainers", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result: { trainers?: Trainer[]; error?: string } =
      await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not load trainers.");
      setLoading(false);
      return;
    }

    setTrainers(result.trainers || []);
    setLoading(false);
  }

  async function handleAddTrainer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/admin/trainers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
      }),
    });

    const result: { error?: string } = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not add trainer.");
      setSaving(false);
      return;
    }

    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setMessage("Trainer added successfully.");
    setSaving(false);
    await fetchTrainers();
  }

  async function handleRemoveTrainer(trainerId: string, trainerName: string) {
    const confirmed = window.confirm(
      `Remove trainer access for ${trainerName}? Old session history will stay saved.`
    );

    if (!confirmed) return;

    setMessage("");

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const response = await fetch(`/api/admin/trainers?id=${trainerId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result: { error?: string } = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not remove trainer.");
      return;
    }

    setMessage("Trainer access removed.");
    await fetchTrainers();
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString();
  }

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer") {
          router.push("/trainer/scan");
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingRole(false);
      await fetchTrainers();
    }

    protectPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">Checking admin access...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Trainers
              </h1>
              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                View trainer contact info, monthly sessions, and recent session
                history.
              </p>
            </div>

            <Link
              href="/admin"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Admin
            </Link>
          </header>

          {message ? (
            <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-300">
              {message}
            </div>
          ) : null}

          <section className="mb-8 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
            <h2 className="text-2xl font-black">Add Trainer</h2>

            <form
              onSubmit={handleAddTrainer}
              className="mt-5 grid gap-4 md:grid-cols-5"
            >
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                placeholder="Full name"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />

              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                placeholder="Email"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />

              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />

              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                type="password"
                placeholder="Temporary password"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />

              <button
                disabled={saving}
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Adding..." : "Add Trainer"}
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black">Current Trainers</h2>
              <p className="rounded-full border border-yellow-500/30 px-4 py-2 text-sm font-black text-yellow-400">
                {trainers.length} total
              </p>
            </div>

            {loading ? (
              <p className="font-black text-yellow-400">Loading trainers...</p>
            ) : trainers.length === 0 ? (
              <p className="text-sm font-medium text-gray-400">
                No trainers found yet.
              </p>
            ) : (
              <div className="space-y-4">
                {trainers.map((trainer) => {
                  const isExpanded = expandedTrainerId === trainer.id;

                  return (
                    <div
                      key={trainer.id}
                      className="rounded-[2rem] border border-yellow-500/20 bg-black/40 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xl font-black">
                            {trainer.full_name || "Unnamed Trainer"}
                          </p>

                          <div className="mt-3 grid gap-2 text-sm font-bold text-gray-400 md:grid-cols-2">
                            <p>Email: {trainer.email || "No email saved"}</p>
                            <p>Phone: {trainer.phone || "No phone saved"}</p>
                            <p>
                              Added:{" "}
                              {trainer.created_at
                                ? new Date(trainer.created_at).toLocaleDateString()
                                : "Unknown"}
                            </p>
                            <p className="text-yellow-400">
                              This Month:{" "}
                              {trainer.total_sessions_this_month} sessions
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:min-w-44">
                          <button
                            onClick={() =>
                              setExpandedTrainerId(isExpanded ? null : trainer.id)
                            }
                            className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
                          >
                            {isExpanded ? "Hide History" : "View History"}
                          </button>

                          <button
                            onClick={() =>
                              handleRemoveTrainer(
                                trainer.id,
                                trainer.full_name || trainer.email || "trainer"
                              )
                            }
                            className="rounded-2xl border border-red-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black"
                          >
                            Remove Access
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-black/50 p-4">
                          <h3 className="mb-4 text-lg font-black text-yellow-400">
                            Recent Session History
                          </h3>

                          {trainer.recent_session_history.length === 0 ? (
                            <p className="text-sm font-medium text-gray-400">
                              No recent session history for this trainer.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {trainer.recent_session_history.map((log) => (
                                <div
                                  key={log.id}
                                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                                >
                                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="font-black">
                                        {log.client_name}
                                      </p>
                                      <p className="text-xs font-bold text-gray-500">
                                        {log.client_email || "No client email"}
                                      </p>
                                    </div>

                                    <p className="text-sm font-black text-yellow-400">
                                      {formatDateTime(log.scanned_at)}
                                    </p>
                                  </div>

                                  <div className="mt-3 grid gap-2 text-sm font-bold text-gray-400 md:grid-cols-3">
                                    <p>Status: {log.status}</p>
                                    <p>
                                      Remaining After:{" "}
                                      {log.remaining_after ?? "N/A"}
                                    </p>
                                    <p>{log.message || "Session scanned"}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}