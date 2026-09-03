"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

export default function RevenueLayout({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkRole() {
      const { role } = await getCurrentUserRole();
      if (active) setIsAdmin(role === "admin");
    }

    void checkRole();

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      {children}
      {isAdmin ? (
        <Link
          href="/admin/revenue/edit"
          className="fixed bottom-5 right-5 z-40 rounded-2xl border border-yellow-300/40 bg-yellow-400 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-black shadow-2xl transition hover:bg-yellow-300"
        >
          Edit Revenue Numbers
        </Link>
      ) : null}
    </>
  );
}
