"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import Link from "next/link";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ClientWithPackage = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  qr_token: string;
  status: string;
  created_at: string;
  session_packages: {
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    status: string;
  }[];
};

export default function AdminClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientWithPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [checkingRole, setCheckingRole] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [nextPaymentDate, setNextPaymentDate] = useState("");

  const isAdmin = userRole === "admin";

  async function fetchClients() {
    const { data, error } = await supabase
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        qr_token,
        status,
        created_at,
        session_packages (
          total_sessions,
          used_sessions,
          remaining_sessions,
          status
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
    } else {
      const clientData = data || [];
      setClients(clientData);
      await generateQrCodes(clientData);
    }

    setLoading(false);
  }

  async function generateQrCodes(clientList: ClientWithPackage[]) {
    const codes: Record<string, string> = {};

    for (const client of clientList) {
      const qrImage = await QRCode.toDataURL(client.qr_token);
      codes[client.id] = qrImage;
    }

    setQrCodes(codes);
  }

  useEffect(() => {
    async function protectAdminClientsPage() {
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
      await fetchClients();
    }

    protectAdminClientsPage();
  }, [router]);

  const filteredClients = clients.filter((client) => {
    const searchText = search.toLowerCase();

    return (
      client.full_name.toLowerCase().includes(searchText) ||
      (client.email || "").toLowerCase().includes(searchText) ||
      (client.phone || "").toLowerCase().includes(searchText)
    );
  });

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">
            Checking access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Client Management
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={isAdmin ? "/admin" : "/trainer/scan"}
                className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
              >
                {isAdmin ? "Dashboard" : "Scanner"}
              </Link>

              <Link
                href="/history"
                className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
              >
                History
              </Link>

              {isAdmin && (
                <Link
                  href="/admin/clients/new"
                  className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
                >
                  Add Client
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <label className="mb-2 block font-bold text-gray-200">
                Search Clients
              </label>

              <input
                className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                type="text"
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <p className="font-bold text-yellow-400">
                Loading clients...
              </p>
            ) : filteredClients.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-10 text-center">
                <h2 className="mb-2 text-2xl font-black text-white">
                  No Clients Found
                </h2>

                <p className="mb-6 text-gray-300">
                  Try a different search.
                </p>

                {isAdmin && (
                  <Link
                    href="/admin/clients/new"
                    className="inline-block rounded-xl bg-yellow-400 px-6 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
                  >
                    Add Client
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-yellow-500/30 text-left text-sm uppercase tracking-wide text-yellow-400">
                      <th className="p-3">Client</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Used</th>
                      <th className="p-3">Remaining</th>
                      <th className="p-3">QR Code</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredClients.map((client) => {
                      const activePackage = client.session_packages?.[0];

                      return (
                        <tr
                          key={client.id}
                          className="border-b border-white/10 hover:bg-white/[0.04]"
                        >
                          <td className="p-3 font-black text-white">
                            {client.full_name}
                          </td>

                          <td className="p-3 text-gray-300">
                            {client.email || "-"}
                          </td>

                          <td className="p-3 text-gray-300">
                            {client.phone || "-"}
                          </td>

                          <td className="p-3 font-bold text-gray-200">
                            {activePackage?.total_sessions ?? 0}
                          </td>

                          <td className="p-3 font-bold text-gray-200">
                            {activePackage?.used_sessions ?? 0}
                          </td>

                          <td className="p-3 font-black text-yellow-400">
                            {activePackage?.remaining_sessions ?? 0}
                          </td>

                          <td className="p-3">
                            {qrCodes[client.id] ? (
                              <div className="inline-block rounded-xl bg-white p-2">
                                <img
                                  src={qrCodes[client.id]}
                                  alt={`${client.full_name} QR Code`}
                                  className="h-20 w-20 rounded"
                                />
                              </div>
                            ) : (
                              <span className="text-gray-400">
                                Loading QR...
                              </span>
                            )}
                          </td>

                          <td className="p-3">
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-black uppercase ${
                                client.status === "active"
                                  ? "bg-green-200 text-green-900"
                                  : "bg-red-200 text-red-900"
                              }`}
                            >
                              {client.status}
                            </span>
                          </td>

                          <td className="p-3">
                            <Link
                              href={`/admin/clients/${client.id}`}
                              className="rounded-xl bg-yellow-400 px-4 py-2 font-black uppercase text-black hover:bg-yellow-300 transition"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}