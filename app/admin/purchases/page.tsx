"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ClientInfo =
  | {
      full_name: string;
      email: string | null;
    }
  | {
      full_name: string;
      email: string | null;
    }[]
  | null;

type Purchase = {
  id: string;
  client_id: string;
  plan_name: string;
  session_count: number;
  price: number;
  status: string;
  payment_method: string | null;
  confirmed_at: string | null;
  created_at: string;
  clients: ClientInfo;
};

function getClientName(clients: ClientInfo) {
  if (Array.isArray(clients)) {
    return clients[0]?.full_name || "Unknown Client";
  }

  return clients?.full_name || "Unknown Client";
}

function getClientEmail(clients: ClientInfo) {
  if (Array.isArray(clients)) {
    return clients[0]?.email || "";
  }

  return clients?.email || "";
}

export default function AdminPurchasesPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [message, setMessage] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        router.push("/trainer/scan");
        return;
      }

      await fetchPurchases();
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  async function fetchPurchases() {
    const { data, error } = await supabase
      .from("client_purchases")
      .select(
        `
        *,
        clients (
          full_name,
          email
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPurchases((data || []) as unknown as Purchase[]);
  }

  async function confirmPurchase(purchaseId: string) {
    setMessage("");
    setConfirmingId(purchaseId);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Please log in again.");
      setConfirmingId(null);
      return;
    }

    const response = await fetch("/api/admin/confirm-purchase", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        purchaseId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not confirm purchase.");
      setConfirmingId(null);
      return;
    }

    setMessage("Purchase confirmed. Sessions and revenue were updated.");
    await fetchPurchases();
    setConfirmingId(null);
  }

  async function cancelPurchase(purchaseId: string) {
    setMessage("");

    const { error } = await supabase
      .from("client_purchases")
      .update({ status: "cancelled" })
      .eq("id", purchaseId)
      .eq("status", "pending");

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Purchase cancelled.");
    await fetchPurchases();
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="font-black text-yellow-400">Checking admin access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Purchases
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Confirm client package purchases and automatically update
                sessions.
              </p>
            </div>

            <Link
              href="/admin"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Admin Dashboard
            </Link>
          </header>

          {message && (
            <div className="mb-6 rounded-3xl border border-yellow-500/30 bg-yellow-400/10 p-5 text-sm font-bold text-yellow-300">
              {message}
            </div>
          )}

          <section className="space-y-4">
            {purchases.length === 0 && (
              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-6">
                <p className="font-bold text-gray-400">
                  No purchases yet.
                </p>
              </div>
            )}

            {purchases.map((purchase) => (
              <div
                key={purchase.id}
                className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6"
              >
                <div className="grid gap-5 md:grid-cols-[1.5fr_1fr_1fr] md:items-center">
                  <div>
                    <p className="text-2xl font-black text-white">
                      {purchase.plan_name}
                    </p>

                    <p className="mt-2 text-sm font-bold text-gray-400">
                      Client:{" "}
                      <span className="text-yellow-400">
                        {getClientName(purchase.clients)}
                      </span>
                    </p>

                    {getClientEmail(purchase.clients) && (
                      <p className="mt-1 text-sm font-bold text-gray-500">
                        {getClientEmail(purchase.clients)}
                      </p>
                    )}

                    <p className="mt-2 text-sm text-gray-500">
                      Requested:{" "}
                      {new Date(purchase.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-4xl font-black text-yellow-400">
                      ${Number(purchase.price).toFixed(2)}
                    </p>

                    <p className="mt-2 text-sm font-bold text-gray-300">
                      {purchase.session_count} sessions
                    </p>

                    <p
                      className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${
                        purchase.status === "paid"
                          ? "bg-green-400 text-black"
                          : purchase.status === "cancelled"
                          ? "bg-red-400 text-black"
                          : "bg-yellow-400 text-black"
                      }`}
                    >
                      {purchase.status}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {purchase.status === "pending" && (
                      <>
                        <button
                          onClick={() => confirmPurchase(purchase.id)}
                          disabled={confirmingId === purchase.id}
                          className="rounded-2xl bg-yellow-400 p-4 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
                        >
                          {confirmingId === purchase.id
                            ? "Confirming..."
                            : "Mark As Paid"}
                        </button>

                        <button
                          onClick={() => cancelPurchase(purchase.id)}
                          className="rounded-2xl border border-red-400 p-4 text-sm font-black uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {purchase.status !== "pending" && (
                      <p className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4 text-center text-sm font-black uppercase text-gray-300">
                        No Action Needed
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}