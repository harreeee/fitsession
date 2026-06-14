"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import { useRouter } from "next/navigation";
import Link from "next/link";

type MembershipPlan = {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price: number;
  status: string;
  created_at: string;
};

export default function AdminMembershipPlansPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sessionCount, setSessionCount] = useState("10");
  const [price, setPrice] = useState("0");

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

      await fetchPlans();
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  async function fetchPlans() {
    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlans((data || []) as MembershipPlan[]);
  }

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const parsedSessions = Number(sessionCount);
    const parsedPrice = Number(price);

    if (!name.trim()) {
      setMessage("Plan name is required.");
      return;
    }

    if (Number.isNaN(parsedSessions) || parsedSessions < 0) {
      setMessage("Session count must be 0 or more.");
      return;
    }

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setMessage("Price must be 0 or more.");
      return;
    }

    const { error } = await supabase.from("membership_plans").insert({
      name: name.trim(),
      description: description.trim() || null,
      session_count: parsedSessions,
      price: parsedPrice,
      status: "active",
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setName("");
    setDescription("");
    setSessionCount("10");
    setPrice("0");
    setMessage("Membership plan created.");
    await fetchPlans();
  }

  async function toggleStatus(plan: MembershipPlan) {
    const nextStatus = plan.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("membership_plans")
      .update({ status: nextStatus })
      .eq("id", plan.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await fetchPlans();
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
                Membership Plans
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Create and manage packages clients can request to buy.
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

          <section className="mb-8 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <h2 className="mb-5 text-2xl font-black uppercase">
              Create New Plan
            </h2>

            <form onSubmit={createPlan} className="grid gap-4 md:grid-cols-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Plan name"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="Price"
                type="number"
                min="0"
                step="0.01"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <input
                value={sessionCount}
                onChange={(event) => setSessionCount(event.target.value)}
                placeholder="Session count"
                type="number"
                min="0"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <button className="rounded-2xl bg-yellow-400 p-4 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 md:col-span-2">
                Create Plan
              </button>
            </form>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur"
              >
                <p className="text-2xl font-black text-yellow-400">
                  {plan.name}
                </p>

                <p className="mt-3 min-h-12 text-sm leading-6 text-gray-400">
                  {plan.description || "No description"}
                </p>

                <p className="mt-5 text-4xl font-black">
                  ${Number(plan.price).toFixed(2)}
                </p>

                <p className="mt-2 text-sm font-bold text-gray-300">
                  {plan.session_count} sessions
                </p>

                <p
                  className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${
                    plan.status === "active"
                      ? "bg-green-400 text-black"
                      : "bg-red-400 text-black"
                  }`}
                >
                  {plan.status}
                </p>

                <button
                  onClick={() => toggleStatus(plan)}
                  className="mt-6 w-full rounded-2xl border border-yellow-400 p-4 text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  {plan.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}