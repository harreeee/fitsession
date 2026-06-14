"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Client = {
  id: string;
  full_name: string;
  email: string | null;
};

type MembershipPlan = {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price: number;
  status: string;
};

type SessionPackage = {
  id: string;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  status: string;
  expires_at: string | null;
  created_at: string;
};

type ClientPurchase = {
  id: string;
  plan_name: string;
  session_count: number;
  price: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export default function ClientMembershipPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [purchases, setPurchases] = useState<ClientPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "client") {
        if (role === "admin") {
          router.push("/admin");
          return;
        }

        if (role === "trainer") {
          router.push("/trainer/scan");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, full_name, email")
        .eq("profile_id", user.id)
        .single();

      if (clientError || !clientData) {
        setMessage("Client profile not found.");
        setCheckingRole(false);
        setLoading(false);
        return;
      }

      setClient(clientData as Client);

      const { data: planData } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("status", "active")
        .order("price", { ascending: true });

      const { data: packageData } = await supabase
        .from("session_packages")
        .select("*")
        .eq("client_id", clientData.id)
        .order("created_at", { ascending: false });

      const { data: purchaseData } = await supabase
        .from("client_purchases")
        .select("*")
        .eq("client_id", clientData.id)
        .order("created_at", { ascending: false });

      setPlans((planData || []) as MembershipPlan[]);
      setPackages((packageData || []) as SessionPackage[]);
      setPurchases((purchaseData || []) as ClientPurchase[]);

      setCheckingRole(false);
      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function refreshClientData(clientId: string) {
    const { data: purchaseData } = await supabase
      .from("client_purchases")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    const { data: packageData } = await supabase
      .from("session_packages")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    setPurchases((purchaseData || []) as ClientPurchase[]);
    setPackages((packageData || []) as SessionPackage[]);
  }

  async function buyPlan(planId: string) {
    if (!client) return;

    setBuyingPlanId(planId);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Please log in again.");
      setBuyingPlanId(null);
      return;
    }

    const response = await fetch("/api/client/purchase-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        planId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not create purchase request.");
      setBuyingPlanId(null);
      return;
    }

    setMessage(
      "Purchase request created. Please pay the gym/admin. Your sessions will be added after admin confirms payment."
    );

    await refreshClientData(client.id);
    setBuyingPlanId(null);
  }

  if (checkingRole || loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="font-black text-yellow-400">Loading membership...</p>
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
                Membership
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                View your current sessions, choose a package, and track your
                purchase history.
              </p>
            </div>

            <Link
              href="/client"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back To Portal
            </Link>
          </header>

          {message && (
            <div className="mb-6 rounded-3xl border border-yellow-500/30 bg-yellow-400/10 p-5 text-sm font-bold leading-6 text-yellow-300">
              {message}
            </div>
          )}

          <section className="mb-8 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Current Membership
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Client:{" "}
              <span className="font-black text-yellow-400">
                {client?.full_name}
              </span>
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {packages.length === 0 && (
                <div className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5">
                  <p className="font-bold text-gray-300">
                    No session package found yet.
                  </p>
                </div>
              )}

              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5"
                >
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Sessions Remaining
                  </p>

                  <p className="mt-3 text-5xl font-black text-yellow-400">
                    {pkg.remaining_sessions}
                  </p>

                  <div className="mt-5 space-y-2 text-sm font-bold text-gray-300">
                    <p>Total: {pkg.total_sessions}</p>
                    <p>Used: {pkg.used_sessions}</p>
                    <p>Status: {pkg.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-black uppercase tracking-tight">
              Buy A Package
            </h2>

            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur"
                >
                  <p className="text-2xl font-black text-yellow-400">
                    {plan.name}
                  </p>

                  <p className="mt-3 min-h-12 text-sm leading-6 text-gray-400">
                    {plan.description || "Membership package"}
                  </p>

                  <p className="mt-5 text-4xl font-black text-white">
                    ${Number(plan.price).toFixed(2)}
                  </p>

                  <p className="mt-2 text-sm font-bold text-gray-300">
                    {plan.session_count > 0
                      ? `${plan.session_count} sessions`
                      : "Membership plan"}
                  </p>

                  <button
                    onClick={() => buyPlan(plan.id)}
                    disabled={buyingPlanId === plan.id}
                    className="mt-6 w-full rounded-2xl bg-yellow-400 p-4 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
                  >
                    {buyingPlanId === plan.id
                      ? "Creating Request..."
                      : "Buy Package"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <h2 className="mb-5 text-2xl font-black uppercase tracking-tight">
              Purchase History
            </h2>

            <div className="space-y-4">
              {purchases.length === 0 && (
                <p className="font-bold text-gray-400">
                  No purchases yet.
                </p>
              )}

              {purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xl font-black text-white">
                        {purchase.plan_name}
                      </p>

                      <p className="mt-1 text-sm font-bold text-gray-400">
                        {new Date(purchase.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="text-2xl font-black text-yellow-400">
                        ${Number(purchase.price).toFixed(2)}
                      </p>

                      <p
                        className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${
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
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}