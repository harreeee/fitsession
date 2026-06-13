"use client";

import { useState } from "react";
import Link from "next/link";

export default function ClientActivatePage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleActivate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const response = await fetch("/api/client/activate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, code, password }),
    });

    const result = await response.json();

    setLoading(false);

    if (!response.ok) {
      alert(result.error || "Could not activate account.");
      return;
    }

    alert("Your account is ready. You can now log in.");
    window.location.href = "/client/login";
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
              Activate Client Account
            </p>
          </div>

          <form
            onSubmit={handleActivate}
            className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur"
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-500/30 bg-black/50 text-3xl">
                🔐
              </div>

              <h2 className="text-2xl font-black uppercase text-white">
                First-Time Setup
              </h2>

              <p className="mt-2 text-gray-400">
                Enter your email, authorization code, and create your password.
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

            <div className="mb-4">
              <label className="mb-2 block font-bold text-gray-200">
                Authorization Code
              </label>

              <input
                className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                type="text"
                placeholder="Example: 493821"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <div className="mb-6">
              <label className="mb-2 block font-bold text-gray-200">
                Create Password
              </label>

              <input
                className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                type="password"
                placeholder="Minimum 6 characters"
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
              {loading ? "Activating..." : "Activate Account"}
            </button>

            <Link
              href="/client/login"
              className="mt-4 block text-center text-sm font-bold text-yellow-400 hover:text-yellow-300"
            >
              Already activated? Client login
            </Link>
          </form>
        </div>
      </div>
    </main>
  );
}