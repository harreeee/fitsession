"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

export default function AddClientPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sessions, setSessions] = useState("");
 // const [nextPaymentDate, setNextPaymentDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  function generateQrToken() {
    return `FXA-${crypto.randomUUID()}`;
  }

  useEffect(() => {
    async function protectAddClientPage() {
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
    }

    protectAddClientPage();
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const totalSessions = Number(sessions);

    if (!fullName.trim()) {
      alert("Client name is required.");
      setLoading(false);
      return;
    }

    if (Number.isNaN(totalSessions) || totalSessions < 0) {
      alert("Please enter a valid number of sessions.");
      setLoading(false);
      return;
    }

    const qrToken = generateQrToken();

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        qr_token: qrToken,
        status: "active",
       // next_payment_date: nextPaymentDate || null,
      })
      .select()
      .single();

    if (clientError) {
      alert(clientError.message);
      setLoading(false);
      return;
    }

    const { error: packageError } = await supabase
      .from("session_packages")
      .insert({
        client_id: client.id,
        total_sessions: totalSessions,
        used_sessions: 0,
        remaining_sessions: totalSessions,
        status: "active",
      });

    if (packageError) {
      alert(packageError.message);
      setLoading(false);
      return;
    }

    alert("Client created successfully!");
    router.push("/admin/clients");
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Checking admin access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>
              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Add New Client
              </p>
            </div>

            <Link
              href="/admin/clients"
              className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
            >
              Back
            </Link>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-yellow-500/30 bg-black/50 flex items-center justify-center text-3xl">
                👤
              </div>

              <h2 className="text-3xl font-black text-white uppercase">
                Create Client
              </h2>

              <p className="mt-2 text-gray-400">
                Add a client, assign sessions, and generate a secure QR code.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <label className="mb-2 block font-bold text-gray-200">
                  Full Name
                </label>
                <input
                  className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                  type="text"
                  placeholder="John Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="mb-5">
                <label className="mb-2 block font-bold text-gray-200">
                  Email
                </label>
                <input
                  className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="mb-5">
                <label className="mb-2 block font-bold text-gray-200">
                  Phone
                </label>
                <input
                  className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                  type="text"
                  placeholder="416-123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

            

              <div className="mb-8">
                <label className="mb-2 block font-bold text-gray-200">
                  Starting Sessions
                </label>
                <input
                  className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                  type="number"
                  min="0"
                  placeholder="10"
                  value={sessions}
                  onChange={(e) => setSessions(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-yellow-400 p-3 text-lg font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
              >
                {loading ? "Creating Client..." : "Create Client"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}