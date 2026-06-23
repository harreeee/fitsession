"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type CalendarConnection = {
  google_email: string | null;
  calendar_id: string;
  updated_at: string | null;
};

export default function TrainerCalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState("");
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  useEffect(() => {
    async function protectPage() {
      const { user, role: currentRole } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (
        currentRole !== "admin" &&
        currentRole !== "trainer" &&
        currentRole !== "nutrition_coach"
      ) {
        router.push("/login");
        return;
      }

      setRole(currentRole || "");
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  useEffect(() => {
    async function loadConnection() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadingConnection(false);
        return;
      }

      const { data } = await supabase
        .from("trainer_google_calendar_connections")
        .select("google_email, calendar_id, updated_at")
        .eq("trainer_id", user.id)
        .maybeSingle();

      setConnection((data || null) as CalendarConnection | null);
      setLoadingConnection(false);
    }

    if (!checkingRole) {
      loadConnection();
    }
  }, [checkingRole, connected]);

  async function connectGoogleCalendar() {
    setConnecting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.push("/login");
      return;
    }

    window.location.href = `/api/google-calendar/connect?token=${encodeURIComponent(
      session.access_token
    )}`;
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="font-black text-yellow-400">Checking access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
              FXA FITNESS
            </p>

            <h1 className="text-4xl font-black tracking-tight md:text-6xl">
              Google Calendar
            </h1>

            <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
              Connect your Google Calendar so clients can book available
              session times.
            </p>
          </header>

          {connected ? (
            <div className="mb-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 font-bold text-green-300">
              Google Calendar connected successfully.
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 font-bold text-red-300">
              {error}
            </div>
          ) : null}

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            {loadingConnection ? (
              <p className="font-black text-yellow-400">Loading...</p>
            ) : connection ? (
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-gray-400">
                  Connected Account
                </p>

                <p className="mt-3 text-2xl font-black text-yellow-400">
                  {connection.google_email || "Google Calendar connected"}
                </p>

                <p className="mt-2 text-sm font-bold text-gray-400">
                  Calendar: {connection.calendar_id || "primary"}
                </p>

                <button
                  type="button"
                  onClick={connectGoogleCalendar}
                  disabled={connecting}
                  className="mt-6 w-full rounded-2xl border border-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:opacity-60"
                >
                  {connecting ? "Connecting..." : "Reconnect Google Calendar"}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-lg font-bold text-gray-300">
                  No Google Calendar is connected yet.
                </p>

                <button
                  type="button"
                  onClick={connectGoogleCalendar}
                  disabled={connecting}
                  className="mt-6 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
                >
                  {connecting ? "Connecting..." : "Connect Google Calendar"}
                </button>
              </div>
            )}
          </section>

          <div className="mt-6">
            <Link
              href={role === "admin" ? "/admin" : "/trainer/scan"}
              className="block rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              {role === "admin" ? "Back to Admin" : "Back to Scanner"}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}