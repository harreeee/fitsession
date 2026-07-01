"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getDashboardPathForRole, getRoleDisplayName } from "../../lib/role";

export default function LoginPage() {
  const router = useRouter();

  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleStaffLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: loginData, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

    if (loginError || !loginData.user) {
      setMessage(loginError?.message || "Login failed.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", loginData.user.id)
      .maybeSingle();

    if (profileError || !profile?.role) {
      await supabase.auth.signOut();
      setMessage("No staff role found for this account.");
      setLoading(false);
      return;
    }

    if (profile.role === "client") {
      await supabase.auth.signOut();
      setMessage("Please use Client Login for client accounts.");
      setLoading(false);
      return;
    }

    const destination = getDashboardPathForRole(profile.role);

    if (destination === "/login") {
      await supabase.auth.signOut();
      setMessage(`Unknown role: ${getRoleDisplayName(profile.role)}`);
      setLoading(false);
      return;
    }

    router.replace(destination);
    router.refresh();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#fff8df] text-zinc-950">
      <style jsx global>{`
        html,
        body {
          background: #fff8df;
        }

        @keyframes fade-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fade-up {
          animation: fade-up 0.5s ease both;
        }

        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-10px);
          }
        }

        .float-slow {
          animation: float-slow 4.5s ease-in-out infinite;
        }

        @keyframes shine {
          from {
            transform: translateX(-120%) skewX(-12deg);
          }

          to {
            transform: translateX(220%) skewX(-12deg);
          }
        }

        .shine::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 45%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.45),
            transparent
          );
          animation: shine 4s ease-in-out infinite;
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-36 -top-36 h-[430px] w-[430px] rounded-full bg-yellow-300/55 blur-[100px]" />
        <div className="absolute right-[-120px] top-24 h-[430px] w-[430px] rounded-full bg-amber-200/55 blur-[110px]" />
        <div className="absolute bottom-[-180px] left-1/3 h-[440px] w-[440px] rounded-full bg-white/70 blur-[110px]" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(24,24,27,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(24,24,27,0.045)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(255,248,223,0.58)_72%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-5 sm:px-6">
        <header className="fade-up mx-auto flex w-full max-w-6xl items-center justify-between rounded-[1.75rem] border border-zinc-900/10 bg-white/75 px-4 py-3 shadow-[0_18px_70px_rgba(24,24,27,0.1)] backdrop-blur-xl sm:px-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-sm font-black tracking-tight text-yellow-300 shadow-lg shadow-yellow-500/20">
              FXA
            </div>

            <div>
              <p className="text-base font-black tracking-tight text-zinc-950 sm:text-lg">
                FXA FITNESS
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                Member Portal
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-yellow-500/35 bg-yellow-300/45 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-950 sm:flex">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            Private Training Studio
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_470px] lg:py-12">
          <div className="fade-up hidden lg:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-900/10 bg-white/70 px-4 py-2 shadow-sm backdrop-blur">
              <span className="rounded-full bg-yellow-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-950">
                Toronto
              </span>
              <span className="text-xs font-bold text-zinc-600">
                Personal training made simple
              </span>
            </div>

            <h1 className="mt-6 max-w-2xl text-6xl font-black leading-[0.95] tracking-[-0.06em] text-zinc-950 xl:text-7xl">
              Train with focus.
              <br />
              Track with clarity.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
              A clean portal for FXA clients, trainers, nutrition coaches,
              managers, and admin team members to manage sessions with
              confidence.
            </p>

            <div className="mt-8 grid max-w-xl grid-cols-3 gap-4">
              <div className="rounded-[1.7rem] border border-zinc-900/10 bg-white/75 p-5 shadow-[0_16px_45px_rgba(24,24,27,0.08)] backdrop-blur">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-300 text-xl">
                  📲
                </div>
                <p className="mt-4 text-sm font-black text-zinc-950">
                  QR Check-In
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Fast scan for completed sessions.
                </p>
              </div>

              <div className="rounded-[1.7rem] border border-zinc-900/10 bg-white/75 p-5 shadow-[0_16px_45px_rgba(24,24,27,0.08)] backdrop-blur">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-xl">
                  🏋️
                </div>
                <p className="mt-4 text-sm font-black text-zinc-950">Coaching</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Trainer and nutrition access.
                </p>
              </div>

              <div className="rounded-[1.7rem] border border-zinc-900/10 bg-white/75 p-5 shadow-[0_16px_45px_rgba(24,24,27,0.08)] backdrop-blur">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-300 text-xl">
                  📊
                </div>
                <p className="mt-4 text-sm font-black text-zinc-950">Progress</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Clear package and session records.
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <div className="flex -space-x-3">
                <div className="h-10 w-10 rounded-full border-2 border-white bg-black" />
                <div className="h-10 w-10 rounded-full border-2 border-white bg-yellow-300" />
                <div className="h-10 w-10 rounded-full border-2 border-white bg-zinc-200" />
              </div>
              <p className="text-sm font-semibold text-zinc-500">
                Built for clients, trainers, managers, and the FXA team.
              </p>
            </div>
          </div>

          <div className="fade-up mx-auto w-full max-w-md">
            <div className="relative overflow-hidden rounded-[2.25rem] border border-zinc-900/10 bg-white shadow-[0_28px_90px_rgba(24,24,27,0.16)]">
              <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-black via-yellow-300 to-black" />

              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-yellow-300/45 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-black/10 blur-3xl" />

              <div className="relative p-6 sm:p-7">
                <div className="text-center">
                  <div className="float-slow mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-black text-xl font-black tracking-tight text-yellow-300 shadow-2xl shadow-yellow-500/20">
                    FXA
                  </div>

                  <p className="mt-5 text-[11px] font-black uppercase tracking-[0.32em] text-yellow-600">
                    FXA FITNESS
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-zinc-950">
                    Welcome Back
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Choose your access type to continue.
                  </p>
                </div>

                {!showStaffLogin ? (
                  <div className="mt-7 grid gap-3">
                    <Link
                      href="/client/login"
                      className="shine relative overflow-hidden rounded-[1.5rem] border border-black bg-black p-5 text-white shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
                    >
                      <div className="relative flex items-center gap-4">
                        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-yellow-300 text-2xl text-black">
                          👤
                        </div>

                        <div className="text-left">
                          <p className="text-sm font-black uppercase tracking-wide">
                            Client Login
                          </p>
                          <p className="mt-1 text-xs leading-5 text-white/65">
                            View package, QR code, and session history.
                          </p>
                        </div>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setShowStaffLogin(true);
                        setMessage("");
                      }}
                      className="rounded-[1.5rem] border border-yellow-400/60 bg-yellow-300/80 p-5 text-left text-zinc-950 shadow-lg shadow-yellow-500/10 transition hover:-translate-y-0.5 hover:bg-yellow-300 hover:shadow-xl active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-black text-2xl text-yellow-300">
                          🔐
                        </div>

                        <div>
                          <p className="text-sm font-black uppercase tracking-wide">
                            Staff Login
                          </p>
                          <p className="mt-1 text-xs leading-5 text-zinc-700">
                            Admin, manager, trainer, or nutrition coach.
                          </p>
                        </div>
                      </div>
                    </button>

                    <div className="mt-2 border-t border-zinc-900/10 pt-4">
                      <Link
                        href="/client/activate"
                        className="block rounded-2xl border border-zinc-900/10 bg-zinc-50 px-4 py-3 text-center shadow-sm transition hover:border-yellow-400/50 hover:bg-yellow-50 active:scale-[0.98]"
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-950">
                          First-Time Client?
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                          Activate with your FXA code.
                        </p>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleStaffLogin} className="mt-7">
                    <button
                      type="button"
                      onClick={() => {
                        setShowStaffLogin(false);
                        setMessage("");
                        setEmail("");
                        setPassword("");
                      }}
                      className="mb-5 inline-flex items-center rounded-full border border-zinc-900/10 bg-zinc-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-700 transition hover:bg-zinc-950 hover:text-yellow-300"
                    >
                      ← Back
                    </button>

                    <div className="mb-5 rounded-[1.4rem] border border-yellow-400/50 bg-yellow-100/70 p-4">
                      <p className="text-sm font-black text-zinc-950">
                        Staff Login
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">
                        For admin, manager, trainer, and nutrition coach
                        accounts only.
                      </p>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-zinc-500">
                        Email
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@fxafitness.com"
                        className="w-full rounded-2xl border border-zinc-900/10 bg-zinc-50 px-4 py-4 text-base font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-yellow-500 focus:bg-white focus:ring-4 focus:ring-yellow-300/30"
                        required
                      />
                    </label>

                    <label className="mt-4 block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-zinc-500">
                        Password
                      </span>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        placeholder="Enter password"
                        className="w-full rounded-2xl border border-zinc-900/10 bg-zinc-50 px-4 py-4 text-base font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-yellow-500 focus:bg-white focus:ring-4 focus:ring-yellow-300/30"
                        required
                      />
                    </label>

                    {message ? (
                      <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
                        {message}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-5 w-full rounded-2xl bg-black px-5 py-4 text-sm font-black uppercase tracking-wide text-yellow-300 shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                    >
                      {loading ? "Signing in..." : "Staff Sign In"}
                    </button>
                  </form>
                )}
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-zinc-500">
              Need help logging in? Please contact the FXA FITNESS team.
            </p>
          </div>
        </section>

        <footer className="fade-up mx-auto w-full max-w-6xl border-t border-zinc-900/10 py-5 text-center">
          <p className="text-[11px] font-medium text-zinc-500">
            © 2026 FXA FITNESS · All rights reserved.
          </p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">
            Designed by HarryDang
          </p>
        </footer>
      </div>
    </main>
  );
}