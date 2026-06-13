"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type ClientDetail = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  qr_token: string;
  status: string;
  session_packages: {
    id: string;
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    status: string;
  }[];
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [userRole, setUserRole] = useState("");
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [sessionsToAdd, setSessionsToAdd] = useState("");
  const [addingSessions, setAddingSessions] = useState(false);

  const [loginCode, setLoginCode] = useState("");
  const [loginCodeEmail, setLoginCodeEmail] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);

  const isAdmin = userRole === "admin";

  async function fetchClient() {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        qr_token,
        status,
        session_packages (
          id,
          total_sessions,
          used_sessions,
          remaining_sessions,
          status
        )
      `)
      .eq("id", clientId)
      .single();

    if (error) {
      alert(error.message);
    } else {
      setClient(data);
      setEditName(data.full_name || "");
      setEditEmail(data.email || "");
      setEditPhone(data.phone || "");

      const qrImage = await QRCode.toDataURL(data.qr_token);
      setQrCode(qrImage);
    }

    setLoading(false);
  }

  async function updateClientInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin || !client) return;

    if (!editName.trim()) {
      alert("Client name is required.");
      return;
    }

    setSavingInfo(true);

    const { error } = await supabase
      .from("clients")
      .update({
        full_name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setSavingInfo(false);
      return;
    }

    alert("Client info updated.");
    await fetchClient();
    setSavingInfo(false);
  }

  async function addMoreSessions(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin || !client) return;

    const amount = Number(sessionsToAdd);

    if (Number.isNaN(amount) || amount <= 0) {
      alert("Enter a valid number of sessions.");
      return;
    }

    const activePackage = client.session_packages?.[0];

    if (!activePackage) {
      alert("No active package found.");
      return;
    }

    setAddingSessions(true);

    const { error } = await supabase
      .from("session_packages")
      .update({
        total_sessions: activePackage.total_sessions + amount,
        remaining_sessions: activePackage.remaining_sessions + amount,
      })
      .eq("id", activePackage.id);

    if (error) {
      alert(error.message);
      setAddingSessions(false);
      return;
    }

    alert("Sessions added successfully!");
    setSessionsToAdd("");
    await fetchClient();
    setAddingSessions(false);
  }

  async function toggleClientStatus() {
    if (!isAdmin || !client) return;

    const newStatus = client.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("clients")
      .update({ status: newStatus })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`Client is now ${newStatus}.`);
    await fetchClient();
  }

  async function generateClientLoginCode() {
    if (!isAdmin || !client) return;

    setGeneratingCode(true);
    setLoginCode("");
    setLoginCodeEmail("");

    try {
      const response = await fetch("/api/admin/client-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId: client.id }),
      });

      const result = await response.json();
      setGeneratingCode(false);

      if (!response.ok) {
        alert(result.error || "Could not generate login code.");
        return;
      }

      setLoginCode(result.code);
      setLoginCodeEmail(result.email);
      alert(`Code generated: ${result.code}`);
    } catch (error) {
      console.error(error);
      setGeneratingCode(false);
      alert("Server error. Check if app/api/admin/client-code/route.ts exists.");
    }
  }

  useEffect(() => {
    async function protectClientDetailPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin" && role !== "trainer") {
        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setUserRole(role || "");
      setCheckingRole(false);
      await fetchClient();
    }

    protectClientDetailPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">Checking access...</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <p className="text-yellow-400 font-black">Loading client...</p>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <p className="text-yellow-400 font-black">Client not found.</p>
      </main>
    );
  }

  const activePackage = client.session_packages?.[0];

  return (
    <main className="min-h-screen bg-black text-white p-6 print:bg-white">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6 print:bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 print:hidden">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>
              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Client Profile
              </p>
            </div>

            <div className="flex gap-3">
              {isAdmin && (
                <button
                  onClick={toggleClientStatus}
                  className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
                >
                  {client.status === "active" ? "Deactivate" : "Reactivate"}
                </button>
              )}

              <Link
                href="/admin/clients"
                className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
              >
                Back
              </Link>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 print:block">
            <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur print:bg-white print:border-0 print:shadow-none">
              <div className="mb-8">
                <p className="text-yellow-400 font-black uppercase tracking-widest text-sm">
                  Client
                </p>

                <h2 className="text-4xl font-black text-white print:text-black">
                  {client.full_name}
                </h2>

                <p className="mt-2 text-gray-300 print:text-black">
                  Status:{" "}
                  <span className="font-black text-yellow-400 print:text-black">
                    {client.status}
                  </span>
                </p>
              </div>

              {isAdmin && (
                <form onSubmit={updateClientInfo} className="print:hidden">
                  <h3 className="mb-4 text-2xl font-black text-white">
                    Edit Client Info
                  </h3>

                  <div className="mb-4">
                    <label className="mb-2 block font-bold text-gray-200">
                      Full Name
                    </label>
                    <input
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block font-bold text-gray-200">
                      Email
                    </label>
                    <input
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 block font-bold text-gray-200">
                      Phone
                    </label>
                    <input
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingInfo}
                    className="mb-8 w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                  >
                    {savingInfo ? "Saving..." : "Save Client Info"}
                  </button>
                </form>
              )}

              <div>
                <h3 className="mb-4 text-2xl font-black text-white print:text-black">
                  Client Info
                </h3>

                <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-5 print:border-black print:bg-white">
                  <p className="text-gray-200 print:text-black">
                    <strong className="text-yellow-400 print:text-black">
                      Name:
                    </strong>{" "}
                    {client.full_name}
                  </p>

                  <p className="text-gray-200 print:text-black">
                    <strong className="text-yellow-400 print:text-black">
                      Email:
                    </strong>{" "}
                    {client.email || "-"}
                  </p>

                  <p className="text-gray-200 print:text-black">
                    <strong className="text-yellow-400 print:text-black">
                      Phone:
                    </strong>{" "}
                    {client.phone || "-"}
                  </p>

                  <p className="text-gray-200 print:text-black">
                    <strong className="text-yellow-400 print:text-black">
                      Status:
                    </strong>{" "}
                    {client.status}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-8 rounded-2xl border border-yellow-500/30 bg-black/40 p-5 print:hidden">
                  <h3 className="mb-2 text-2xl font-black text-white">
                    Client Login Setup
                  </h3>

                  <p className="mb-4 text-gray-300">
                    Generate a first-time authorization code for this client.
                  </p>

                  <button
                    onClick={generateClientLoginCode}
                    disabled={generatingCode}
                    className="w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                  >
                    {generatingCode
                      ? "Generating Code..."
                      : "Generate Client Login Code"}
                  </button>

                  {loginCode && (
                    <div className="mt-5 rounded-xl border border-yellow-400 bg-yellow-400/10 p-4 text-center">
                      <p className="text-sm font-bold uppercase text-gray-300">
                        Give this to the client
                      </p>

                      <p className="mt-2 text-5xl font-black tracking-widest text-yellow-400">
                        {loginCode}
                      </p>

                      <p className="mt-3 text-sm text-gray-300">
                        Email: {loginCodeEmail}
                      </p>

                      <p className="mt-2 text-sm text-gray-400">
                        Client goes to{" "}
                        <span className="font-bold text-yellow-400">
                          /client/activate
                        </span>{" "}
                        and uses this code. Code expires in 7 days.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 grid grid-cols-3 gap-3 print:hidden">
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-5 text-center">
                  <p className="font-bold text-gray-200">Total</p>
                  <p className="text-4xl font-black text-yellow-400">
                    {activePackage?.total_sessions ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-5 text-center">
                  <p className="font-bold text-gray-200">Used</p>
                  <p className="text-4xl font-black text-yellow-400">
                    {activePackage?.used_sessions ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-5 text-center">
                  <p className="font-bold text-gray-200">Left</p>
                  <p className="text-4xl font-black text-yellow-400">
                    {activePackage?.remaining_sessions ?? 0}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <form onSubmit={addMoreSessions} className="mt-8 print:hidden">
                  <label className="mb-2 block font-black text-white">
                    Add More Sessions
                  </label>

                  <div className="flex gap-3">
                    <input
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                      type="number"
                      min="1"
                      placeholder="Example: 10"
                      value={sessionsToAdd}
                      onChange={(e) => setSessionsToAdd(e.target.value)}
                      required
                    />

                    <button
                      type="submit"
                      disabled={addingSessions}
                      className="whitespace-nowrap rounded-xl bg-yellow-400 px-6 py-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                    >
                      {addingSessions ? "Adding..." : "Add"}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur print:bg-white print:border-0 print:shadow-none print:mt-8">
              <p className="mb-2 text-yellow-400 font-black uppercase tracking-widest">
                QR Access
              </p>

              <h2 className="mb-6 text-3xl font-black text-white print:text-black">
                Client QR Code
              </h2>

              <div className="mx-auto inline-block rounded-3xl border border-yellow-500/40 bg-white p-5">
                {qrCode && (
                  <img
                    src={qrCode}
                    alt="Client QR Code"
                    className="mx-auto h-72 w-72 rounded-xl print:h-80 print:w-80"
                  />
                )}
              </div>

              <p className="mx-auto mt-6 max-w-sm text-sm font-bold text-gray-300 print:text-black">
                Trainer scans this QR code to mark one personal training
                session.
              </p>

              <button
                onClick={() => window.print()}
                className="mt-6 rounded-xl bg-yellow-400 px-8 py-3 font-black uppercase text-black hover:bg-yellow-300 transition print:hidden"
              >
                Print QR Card
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}