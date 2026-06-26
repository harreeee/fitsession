"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [creating, setCreating] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status === "active").length,
    [plans]
  );

  const inactivePlans = useMemo(
    () => plans.filter((plan) => plan.status !== "active").length,
    [plans]
  );

  const averagePrice = useMemo(() => {
    if (plans.length === 0) return 0;

    const total = plans.reduce((sum, plan) => {
      return sum + Number(plan.price || 0);
    }, 0);

    return total / plans.length;
  }, [plans]);

  async function fetchPlans() {
    setLoadingPlans(true);

    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .order("created_at", { ascending: false });

    setLoadingPlans(false);

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

    setCreating(true);

    const { error } = await supabase.from("membership_plans").insert({
      name: name.trim(),
      description: description.trim() || null,
      session_count: parsedSessions,
      price: parsedPrice,
      status: "active",
    });

    setCreating(false);

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
    setMessage("");

    const nextStatus = plan.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("membership_plans")
      .update({ status: nextStatus })
      .eq("id", plan.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      nextStatus === "active"
        ? "Membership plan activated."
        : "Membership plan deactivated."
    );

    await fetchPlans();
  }

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }

    return date.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.06] p-8 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.4em] text-yellow-400">
              FXA FITNESS
            </p>
            <p className="mt-4 text-lg font-bold text-white">
              Checking admin access...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-6">
      <div className="min-h-screen rounded-[1.75rem] border border-yellow-500/10 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(250,204,21,0.08),_transparent_28%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 shadow-2xl md:rounded-[2.5rem] md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 overflow-hidden rounded-[2rem] border border-yellow-500/20 bg-black/50 p-5 shadow-2xl backdrop-blur md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
                  Membership Plans
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300 md:text-base">
                  Create and manage training packages that clients can request
                  or purchase. Keep pricing, session count, and availability
                  clear for the team.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/admin"
                  className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Admin Dashboard
                </Link>

                <Link
                  href="/admin/clients"
                  className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
                >
                  Client Management
                </Link>
              </div>
            </div>
          </header>

          {message && (
            <div className="mb-6 rounded-3xl border border-yellow-500/30 bg-yellow-400/10 p-5 text-sm font-bold text-yellow-200 shadow-xl">
              {message}
            </div>
          )}

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.75rem] border border-yellow-500/20 bg-white/[0.06] p-5 shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">
                Total Plans
              </p>
              <p className="mt-3 text-4xl font-black text-white">
                {plans.length}
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-yellow-500/20 bg-white/[0.06] p-5 shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">
                Active
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {activePlans}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-400">
                {inactivePlans} inactive
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-yellow-500/20 bg-white/[0.06] p-5 shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">
                Average Price
              </p>
              <p className="mt-3 text-4xl font-black text-white">
                ${averagePrice.toFixed(2)}
              </p>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
            <section className="rounded-[2rem] border border-yellow-500/20 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
              <div className="mb-6">
                <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-400">
                  Quick Action
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Create New Plan
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-400">
                  Add a package with price, session count, and a short
                  description.
                </p>
              </div>

              <form onSubmit={createPlan} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                    Plan Name
                  </label>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Example: 10 Session Package"
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 p-4 text-sm font-bold text-white outline-none transition placeholder:text-gray-600 focus:border-yellow-400"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                      Price
                    </label>
                    <input
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder="0"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 p-4 text-sm font-bold text-white outline-none transition placeholder:text-gray-600 focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                      Sessions
                    </label>
                    <input
                      value={sessionCount}
                      onChange={(event) => setSessionCount(event.target.value)}
                      placeholder="10"
                      type="number"
                      min="0"
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 p-4 text-sm font-bold text-white outline-none transition placeholder:text-gray-600 focus:border-yellow-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Short note about this package"
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-yellow-500/30 bg-black/60 p-4 text-sm font-bold text-white outline-none transition placeholder:text-gray-600 focus:border-yellow-400"
                  />
                </div>

                <button
                  disabled={creating}
                  className="w-full rounded-2xl bg-yellow-400 p-4 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create Plan"}
                </button>
              </form>
            </section>

            <section className="rounded-[2rem] border border-yellow-500/20 bg-white/[0.05] p-5 shadow-2xl backdrop-blur md:p-6">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-400">
                    Plan Library
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    Current Membership Plans
                  </h2>
                </div>

                <button
                  onClick={fetchPlans}
                  disabled={loadingPlans}
                  className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:border-yellow-400 hover:text-yellow-400 disabled:opacity-60"
                >
                  {loadingPlans ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {plans.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-yellow-500/30 bg-black/40 p-8 text-center">
                  <p className="text-lg font-black text-white">
                    No membership plans yet.
                  </p>
                  <p className="mt-2 text-sm text-gray-400">
                    Create your first plan from the form on the left.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {plans.map((plan) => (
                    <article
                      key={plan.id}
                      className="group rounded-[1.75rem] border border-yellow-500/20 bg-black/45 p-5 shadow-xl transition hover:border-yellow-400/60 hover:bg-black/65"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xl font-black text-yellow-400">
                            {plan.name}
                          </p>
                          <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
                            Created {formatDate(plan.created_at)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${
                            plan.status === "active"
                              ? "bg-green-400 text-black"
                              : "bg-red-400 text-black"
                          }`}
                        >
                          {plan.status}
                        </span>
                      </div>

                      <p className="mt-4 min-h-12 text-sm leading-6 text-gray-400">
                        {plan.description || "No description added."}
                      </p>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
                            Price
                          </p>
                          <p className="mt-2 text-2xl font-black text-white">
                            ${Number(plan.price || 0).toFixed(2)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
                            Sessions
                          </p>
                          <p className="mt-2 text-2xl font-black text-white">
                            {plan.session_count}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleStatus(plan)}
                        className={`mt-5 w-full rounded-2xl p-4 text-sm font-black uppercase tracking-wide transition ${
                          plan.status === "active"
                            ? "border border-red-400/60 text-red-300 hover:bg-red-400 hover:text-black"
                            : "border border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
                        }`}
                      >
                        {plan.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}