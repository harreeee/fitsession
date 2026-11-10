"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import RevenueInlineEditControls from "./RevenueInlineEditControls";

export default function RevenueLayout({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkRole() {
      const { role: currentRole } = await getCurrentUserRole();
      if (active) setRole(currentRole);
    }

    void checkRole();

    return () => {
      active = false;
    };
  }, []);

  const canViewFinance = role === "admin" || role === "manager";
  const isAdmin = role === "admin";

  return (
    <>
      {canViewFinance ? (
        <div className="border-b border-white/10 bg-[#070707] px-3 py-2 text-white md:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-wrap gap-2">
            <Link
              href="/admin/revenue"
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-yellow-400 hover:text-yellow-300"
            >
              Accounting
            </Link>
            <Link
              href="/admin/revenue/receivables"
              className="rounded-lg border border-yellow-400/35 px-3 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-400 hover:text-black"
            >
              Thu công nợ KH
            </Link>
            <Link
              href="/admin/revenue/payroll"
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-yellow-400 hover:text-yellow-300"
            >
              Payroll PT
            </Link>
          </div>
        </div>
      ) : null}
      {isAdmin ? <RevenueInlineEditControls /> : null}
      {children}
    </>
  );
}
