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

    const { data: loginData, error } =
      await supabase.auth.signInWithPassword({
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
      .single();

    if (profileError || !profile) {
      setLoading(false);
      await supabase.auth.signOut();
      alert("No profile role found for this user.");
      return;
    }

    if (profile.role === "admin") {
      router.push("/admin");
      return;
    }

    if (profile.role === "trainer") {
      router.push("/trainer/scan");
      return;
    }

    if (profile.role === "client") {
      router.push("/client");
      return;
    }

    setLoading(false);
    await supabase.auth.signOut();
    alert("Unknown user role.");
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)]">
        <header className="border-b border-yellow-500/20 bg-black/80 backdrop-blur">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-sm md:text-base text-gray-400 tracking-[0.35em] uppercase">
                Frequency x Attention
              </p>
            </div>

            <div className="hidden md:flex gap-8 text-sm font-bold uppercase tracking-wide">
              <span className="text-yellow-400">Home</span>
              <span className="text-gray-300">Services</span>
              <span className="text-gray-300">Contact</span>
            </div>
          </div>
        </header>

        <section className="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-2xl md:text-4xl font-black uppercase mb-3">
              Welcome to
            </p>

            <h2 className="text-6xl md:text-8xl font-black text-yellow-400 leading-none mb-4">
              FXA FITNESS
            </h2>

            <p className="text-2xl md:text-3xl font-black text-gray-500 uppercase tracking-widest mb-8">
              Frequency x Attention
            </p>

            <p className="text-lg md:text-xl text-gray-200 max-w-xl leading-relaxed mb-10">
              Manage training sessions, scan client QR codes, track remaining
              packages, and keep your fitness establishment organized.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl">
              <div className="border border-yellow-500/40 rounded-2xl p-5 bg-white/5 text-center">
                <div className="text-yellow-400 text-3xl mb-2">🏋️</div>
                <p className="text-white font-bold text-sm uppercase">
                  Training
                </p>
              </div>

              <div className="border border-yellow-500/40 rounded-2xl p-5 bg-white/5 text-center">
                <div className="text-yellow-400 text-3xl mb-2">📈</div>
                <p className="text-white font-bold text-sm uppercase">
                  Progress
                </p>
              </div>

              <div className="border border-yellow-500/40 rounded-2xl p-5 bg-white/5 text-center">
                <div className="text-yellow-400 text-3xl mb-2">📅</div>
                <p className="text-white font-bold text-sm uppercase">
                  Sessions
                </p>
              </div>

              <div className="border border-yellow-500/40 rounded-2xl p-5 bg-white/5 text-center">
                <div className="text-yellow-400 text-3xl mb-2">🎯</div>
                <p className="text-white font-bold text-sm uppercase">
                  Results
                </p>
              </div>
            </div>

            <div className="mt-10 border border-white/10 rounded-2xl p-6 bg-white/5 max-w-xl">
              <p className="text-yellow-400 text-5xl leading-none">“</p>

              <p className="text-gray-200 text-lg leading-relaxed">
                Discipline is the frequency. Focus is the attention. Together,
                they transform you.
              </p>

              <p className="text-yellow-400 font-bold mt-4">
                — FXA FITNESS
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <form
              onSubmit={handleLogin}
              className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur"
            >
              <div className="text-center mb-8">
                <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-yellow-500/30 bg-black/50 flex items-center justify-center text-3xl">
                  👤
                </div>

                <h3 className="text-2xl font-black text-white uppercase">
                  Staff Login
                </h3>

                <p className="text-gray-400 mt-2">
                  Admin and trainer access
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-200 mb-2">
                  Email
                </label>

                <input
                  className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                  type="email"
                  placeholder="Email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-200 mb-2">
                  Password
                </label>

                <input
                  className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black p-3 font-black uppercase tracking-wide disabled:opacity-60 transition"
              >
                {loading ? "Logging In..." : "Login"}
              </button>
            </form>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
                <div className="text-center mb-6">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-yellow-500/30 bg-black/50 flex items-center justify-center text-3xl">
                    🏋️
                  </div>

                  <h3 className="text-xl font-black text-white uppercase">
                    Trainer
                  </h3>

                  <p className="text-gray-400 mt-2">
                    Scan client QR codes.
                  </p>
                </div>

                <Link
                  href="/trainer/scan"
                  className="block w-full rounded-xl border border-yellow-400 text-yellow-400 p-3 text-center font-black uppercase hover:bg-yellow-400 hover:text-black transition"
                >
                  Scanner
                </Link>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
                <div className="text-center mb-6">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-yellow-500/30 bg-black/50 flex items-center justify-center text-3xl">
                    📋
                  </div>

                  <h3 className="text-xl font-black text-white uppercase">
                    Manager
                  </h3>

                  <p className="text-gray-400 mt-2">
                    Manage clients and sessions.
                  </p>
                </div>

                <Link
                  href="/admin"
                  className="block w-full rounded-xl bg-yellow-400 text-black p-3 text-center font-black uppercase hover:bg-yellow-300 transition"
                >
                  Dashboard
                </Link>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
                <div className="text-center mb-6">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-yellow-500/30 bg-black/50 flex items-center justify-center text-3xl">
                    👤
                  </div>

                  <h3 className="text-xl font-black text-white uppercase">
                    Client
                  </h3>

                  <p className="text-gray-400 mt-2">
                    View sessions and account status.
                  </p>
                </div>

                <Link
                  href="/client/login"
                  className="block w-full rounded-xl bg-yellow-400 text-black p-3 text-center font-black uppercase hover:bg-yellow-300 transition"
                >
                  Client Login
                </Link>

                <Link
                  href="/client/activate"
                  className="mt-3 block text-center text-sm font-bold text-yellow-400 hover:text-yellow-300"
                >
                  First-time setup
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-yellow-500/20 py-6 text-center text-gray-500 text-sm">
          © 2026 FXA FITNESS. All rights reserved.
        </footer>
      </div>
    </main>
  );
}