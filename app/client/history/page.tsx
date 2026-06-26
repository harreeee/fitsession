"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type TrainingRecord = {
  id: string;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string;
  trainer_name: string;
  source: string;
};

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

function getStatusClass(status: string) {
  if (status === "success") {
    return "border-green-400/30 bg-green-400/10 text-green-300";
  }

  if (status === "manual_subtract" || status === "no_show") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  }

  if (status === "failed" || status === "cancelled") {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }

  return "border-gray-400/30 bg-gray-400/10 text-gray-300";
}

function getStatusLabel(status: string) {
  if (status === "success") return "Completed";
  if (status === "manual_subtract") return "Manual Subtract";
  if (status === "no_show") return "No-Show";
  if (status === "failed") return "Failed";
  return status || "Recorded";
}

function getRemainingClass(value: number | null | undefined) {
  const cleanValue = Number(value ?? 0);

  if (cleanValue <= 0) return "text-red-300";
  if (cleanValue <= 3) return "text-yellow-300";

  return "text-green-300";
}

export default function ClientHistoryPage() {
  const router = useRouter();

  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function fetchTrainingRecords() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setErrorMessage("No active session found. Please log in again.");
      setRecords([]);
      setLoading(false);
      return;
    }

    const response = await fetch("/api/client/training-records", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json().catch(() => null);

    console.log("Client history page result:", result);

    if (!response.ok) {
      setErrorMessage(result?.error || "Could not load training records.");
      setRecords([]);
      setLoading(false);
      return;
    }

    setRecords((result?.logs || []) as TrainingRecord[]);
    setLoading(false);
  }

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/client/login");
        return;
      }

      if (role !== "client") {
        if (role === "admin" || role === "manager") {
          router.push("/admin");
          return;
        }

        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/scan");
          return;
        }

        await supabase.auth.signOut();
        router.push("/client/login");
        return;
      }

      setCheckingRole(false);
      await fetchTrainingRecords();
    }

    protectPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm font-semibold text-yellow-400">
          Checking access...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                Training History
              </h1>

              <p className="mt-2 text-sm text-gray-400">
                Your completed sessions and training records.
              </p>
            </div>

            <Link
              href="/client"
              className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase text-black transition hover:bg-yellow-300"
            >
              Back
            </Link>
          </header>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  Session Records
                </h2>

                <p className="mt-1 text-sm text-gray-400">
                  Total records:{" "}
                  <span className="font-semibold text-yellow-400">
                    {records.length}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={fetchTrainingRecords}
                disabled={loading}
                className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:opacity-60"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {loading ? (
              <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-yellow-400">
                Loading training history...
              </p>
            ) : errorMessage ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
                <p className="text-sm font-semibold text-red-300">
                  {errorMessage}
                </p>
              </div>
            ) : records.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-8 text-center">
                <p className="text-3xl">📋</p>

                <h2 className="mt-3 text-xl font-semibold text-white">
                  No training records found
                </h2>

                <p className="mt-2 text-sm text-gray-400">
                  When your trainer scans your QR code, your session history
                  will show here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((record) => (
                  <div
                    key={`${record.source}-${record.id}`}
                    className="rounded-2xl border border-white/10 bg-black/40 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusClass(
                            record.status
                          )}`}
                        >
                          {getStatusLabel(record.status)}
                        </span>

                        <p className="mt-3 text-sm font-semibold text-white">
                          {formatDateTime(record.created_at)}
                        </p>

                        <p className="mt-1 text-sm text-gray-400">
                          Trainer:{" "}
                          <span className="text-yellow-300">
                            {record.trainer_name}
                          </span>
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-right">
                        <p className="text-[10px] uppercase tracking-widest text-gray-500">
                          Left
                        </p>

                        <p
                          className={`text-2xl font-bold ${getRemainingClass(
                            record.remaining_after
                          )}`}
                        >
                          {record.remaining_after ?? "-"}
                        </p>
                      </div>
                    </div>

                    {record.message ? (
                      <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-300">
                        {record.message}
                      </p>
                    ) : null}

                    {record.trainer_note ? (
                      <p className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                        {record.trainer_note}
                      </p>
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