"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

export default function AdminClientActivatePage() {
  const router = useRouter();

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/scan");
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
      }
    }

    protectPage();
  }, [router]);

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
              FXA FITNESS
            </p>

            <h1 className="text-3xl font-semibold md:text-5xl">
              Client Activation
            </h1>

            <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
              Client activation codes are generated from each client detail page.
            </p>
          </header>

          <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-semibold text-white">
              How to activate a client
            </h2>

            <div className="mt-5 space-y-3 text-sm font-normal leading-6 text-gray-300">
              <p>
                1. Go to the client list.
              </p>

              <p>
                2. Open the client detail page.
              </p>

              <p>
                3. Press Generate First-Time Code.
              </p>

              <p>
                4. Give the client their email and authorization code.
              </p>

              <p>
                5. The client goes to the Activate Client Account page and creates their password.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href="/admin/clients"
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase text-black transition hover:bg-yellow-300"
              >
                Go to Clients
              </Link>

              <Link
                href="/client/activate"
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                Open Client Activate Page
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}