"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type Trainer = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

export default function AdminTrainersPage() {
  const router = useRouter();

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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
    setPassword("");
    setMessage("Trainer added successfully.");
    setSaving(false);
    await fetchTrainers();
  }

  async function handleRemoveTrainer(trainerId: string, trainerName: string) {
    const confirmed = window.confirm(
      `Remove trainer access for ${trainerName}? This keeps old session history but prevents trainer login access.`
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
                Add trainer logins, view active trainers, and remove trainer
                access.
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
              className="mt-5 grid gap-4 md:grid-cols-4"
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
              <div className="space-y-3">
                {trainers.map((trainer) => (
                  <div
                    key={trainer.id}
                    className="flex flex-col gap-4 rounded-2xl border border-yellow-500/20 bg-black/40 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-lg font-black">
                        {trainer.full_name || "Unnamed Trainer"}
                      </p>
                      <p className="text-sm font-bold text-gray-400">
                        {trainer.email}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        handleRemoveTrainer(
                          trainer.id,
                          trainer.full_name || trainer.email
                        )
                      }
                      className="rounded-2xl border border-red-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black"
                    >
                      Remove Access
                    </button>
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