"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ClientWithPackage = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  session_packages: {
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    status: string;
  }[];
};

export default function LowSessionsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientWithPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  async function fetchClients() {
    const { data, error } = await supabase
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        status,
        session_packages (
          total_sessions,
          used_sessions,
          remaining_sessions,
          status
        )
      `)
      .eq("status", "active");

    if (error) {
      alert(error.message);
    } else {
      const lowClients = (data || []).filter((client) => {
        const activePackage = client.session_packages?.[0];

        return (
          activePackage &&
          activePackage.remaining_sessions <= 10
        );
      });

      setClients(lowClients);
    }

    setLoading(false);
  }

  useEffect(() => {
    async function protectLowSessionsPage() {
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
      await fetchClients();
    }

    protectLowSessionsPage();
  }, [router]);

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
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Low Session Alerts
              </p>
            </div>

            <Link
              href="/admin"
              className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
            >
              Dashboard
            </Link>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-white">
                Clients With 10 Or Fewer Sessions
              </h2>

              <p className="mt-2 text-gray-300">
                Use this page to follow up with clients before their session
                packages run out.
              </p>
            </div>

            {loading ? (
              <p className="font-bold text-yellow-400">
                Loading low-session clients...
              </p>
            ) : clients.length === 0 ? (
              <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-yellow-500/30 bg-black/50 text-3xl">
                  ✅
                </div>

                <h2 className="mb-2 text-2xl font-black text-white">
                  No Low-Session Clients
                </h2>

                <p className="text-gray-300">
                  Everyone currently has more than 2 sessions remaining.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {clients.map((client) => {
                  const activePackage = client.session_packages?.[0];
                  const remaining =
                    activePackage?.remaining_sessions ?? 0;

                  return (
                    <div
                      key={client.id}
                      className="rounded-2xl border border-yellow-500/30 bg-black/40 p-5 shadow-lg"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                        <div>
                          <div className="mb-2 inline-block rounded-full bg-red-200 px-3 py-1 text-sm font-black uppercase text-red-900">
                            Low Sessions
                          </div>

                          <h2 className="text-2xl font-black text-white">
                            {client.full_name}
                          </h2>

                          <p className="mt-1 text-gray-300">
                            {client.email || "-"} | {client.phone || "-"}
                          </p>

                          <p className="mt-3 text-lg font-black text-red-400">
                            Remaining Sessions: {remaining}
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="rounded-xl bg-yellow-400 px-5 py-3 text-center font-black uppercase text-black hover:bg-yellow-300 transition"
                          >
                            View Client
                          </Link>

                          <a
                            href={
                              client.phone
                                ? `tel:${client.phone}`
                                : "#"
                            }
                            className="rounded-xl border border-yellow-400 px-5 py-3 text-center font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
                          >
                            Contact
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}