"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ClientLoginPage() {
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
      alert("No client profile found.");
      return;
    }

    if (profile.role !== "client") {
      setLoading(false);
      await supabase.auth.signOut();
      alert("This login page is only for clients.");
      return;
    }

    router.push("/client");
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-md mx-auto pt-16">
          <div className="mb-8 text-center">
            <h1 className="text-5xl font-black text-yellow-400">
              FXA FITNESS
            </h1>

            <p className="mt-2 text-gray-400 tracking-[0.25em] uppercase text-sm">
              Client Portal
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur"
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-500/30 bg-black/50 text-3xl">
                👤
              </div>

              <h2 className="text-2xl font-black uppercase text-white">
                Client Login
              </h2>

              <p className="mt-2 text-gray-400">
                View your remaining sessions and recent training history.
              </p>
            </div>

            <div className="mb-4">
              <label className="mb-2 block font-bold text-gray-200">
                Email
              </label>

              <input
                className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="mb-6">
              <label className="mb-2 block font-bold text-gray-200">
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
              className="w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
            >
              {loading ? "Logging In..." : "Login"}
            </button>

            <Link
              href="/client/activate"
              className="mt-4 block text-center text-sm font-bold text-yellow-400 hover:text-yellow-300"
            >
              First-time setup
            </Link>

            <Link
              href="/login"
              className="mt-3 block text-center text-sm font-bold text-gray-400 hover:text-yellow-300"
            >
              Staff login
            </Link>
          </form>
        </div>
      </div>
    </main>
  );
}