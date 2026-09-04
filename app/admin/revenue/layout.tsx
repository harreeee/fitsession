"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import RevenueInlineEditControls from "./RevenueInlineEditControls";

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
      {isAdmin ? <RevenueInlineEditControls /> : null}
      {children}
    </>
  );
}
