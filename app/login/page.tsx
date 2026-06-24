"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const { data: loginData, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      alert(error.message);
      return;
    }

    const userId = loginData.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      setLoading(false);
      await supabase.auth.signOut();
      alert("No profile role found for this user.");
      return;
    }

    const role = profile.role;

    if (role === "admin") { router.push("/admin"); return; }
    if (role === "trainer" || role === "nutrition_coach") { router.push("/trainer/scan"); return; }
    if (role === "client") { router.push("/client"); return; }

    setLoading(false);
    await supabase.auth.signOut();
    alert("Unknown user role.");
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      <style jsx global>{`
        html, body { background: #080808; }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fu  { animation: fade-up 0.5s ease both; }
        .fu1 { animation-delay: 0.05s; }
        .fu2 { animation-delay: 0.12s; }
        .fu3 { animation-delay: 0.19s; }
        .fu4 { animation-delay: 0.26s; }

        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .shimmer-text {
          background: linear-gradient(90deg, #facc15 0%, #fef08a 40%, #f59e0b 60%, #facc15 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }

        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #facc15; border-radius: 999px; }
      `}</style>

      {/* ── Background glow blobs ───────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-yellow-400/[0.06] blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-yellow-400/[0.04] blur-[100px]" />
        <div className="absolute -bottom-20 left-1/3 h-[300px] w-[300px] rounded-full bg-amber-500/[0.05] blur-[80px]" />
      </div>

      {/* ── Header ─────────────────────────────────────── */}
      <header className="fu relative z-10 border-b border-white/[0.06] bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="shimmer-text text-2xl font-black tracking-tight">FXA FITNESS</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gray-600">
              Frequency × Attention
            </p>
          </div>
          <span className="hidden rounded-full border border-yellow-400/20 bg-yellow-400/[0.07] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-yellow-400 md:inline-block">
            Member Portal
          </span>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 md:px-6">

        {/* ── Hero + Login grid ───────────────────────────── */}
        <div className="fu fu1 mb-10 grid items-start gap-10 lg:grid-cols-2">

          {/* Left — Hero copy */}
          <div className="flex flex-col justify-center pt-4">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-yellow-400">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
              Now open
            </span>

            <h1 className="text-5xl font-black leading-none tracking-tight md:text-7xl">
              Train with
              <br />
              <span className="shimmer-text">purpose.</span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-7 text-gray-400">
              Manage sessions, track your package, scan QR codes, and stay on top of your fitness journey — all in one place.
            </p>

            {/* Stats row */}
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                { icon: "🏋️", label: "Training" },
                { icon: "📊", label: "Progress" },
                { icon: "🎯", label: "Results" },
              ].map(({ icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] py-4 text-center"
                >
                  <span className="text-2xl">{icon}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">{label}</span>
                </div>
              ))}
            </div>

            {/* Quote */}
            <div className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <p className="text-3xl leading-none text-yellow-400/60 font-serif">"</p>
              <p className="mt-1 text-sm leading-6 text-gray-300 italic">
                Discipline is the frequency. Focus is the attention. Together, they transform you.
              </p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-yellow-400">
                — FXA FITNESS
              </p>
            </div>
          </div>

          {/* Right — Login form */}
          <div className="fu fu2 flex flex-col gap-4">

            {/* Staff login form */}
            <form
              onSubmit={handleLogin}
              className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-7 backdrop-blur"
            >
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.08] text-2xl">
                  🔐
                </div>
                <h2 className="text-lg font-bold uppercase tracking-wide text-white">Staff Login</h2>
                <p className="mt-1 text-xs text-gray-500">Admin · Trainer · Nutrition Coach</p>
              </div>

              <div className="mb-3">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@fxafitness.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none transition focus:border-yellow-400/60 focus:ring-1 focus:ring-yellow-400/20"
                />
              </div>

              <div className="mb-5">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none transition focus:border-yellow-400/60 focus:ring-1 focus:ring-yellow-400/20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-yellow-400 py-3 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </button>
            </form>

            {/* Role cards */}
            <div className="fu fu3 grid grid-cols-3 gap-3">
              {[
                { icon: "🏋️", label: "Trainer", desc: "Scan client QR codes", href: "/trainer/scan", outline: true },
                { icon: "🥗", label: "Coach", desc: "Coaching tools", href: "/trainer/scan", outline: true },
                { icon: "📋", label: "Manager", desc: "Full dashboard", href: "/admin", outline: false },
              ].map(({ icon, label, desc, href, outline }) => (
                <Link
                  key={label}
                  href={href}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center text-xs transition active:scale-[0.97] ${
                    outline
                      ? "border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-yellow-400/30 hover:text-white"
                      : "border-yellow-400/30 bg-yellow-400/[0.07] text-yellow-300 hover:bg-yellow-400/[0.12]"
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="font-bold uppercase tracking-wide">{label}</span>
                  <span className="text-[10px] leading-4 text-gray-500">{desc}</span>
                </Link>
              ))}
            </div>

            {/* Client card */}
            <div className="fu fu4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-xl">
                  👤
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-white">Client Access</p>
                  <p className="text-[11px] text-gray-500">View sessions & account status</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/client/login"
                  className="rounded-xl bg-yellow-400 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-black transition hover:bg-yellow-300 active:scale-[0.97]"
                >
                  Client Login
                </Link>
                <Link
                  href="/client/activate"
                  className="rounded-xl border border-yellow-400/30 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400/10 active:scale-[0.97]"
                >
                  First-Time Setup
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.05] py-6 text-center">
        <p className="text-[11px] text-gray-600">© 2026 FXA FITNESS · All rights reserved.</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-700">
          Designed by HarryDang
        </p>
      </footer>
    </main>
  );
}
