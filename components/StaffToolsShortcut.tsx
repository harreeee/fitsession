"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function StaffToolsShortcut() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!active) return;
      setShow(
        ["admin", "manager", "trainer", "nutrition_coach"].includes(
          String(profile?.role || ""),
        ),
      );
    });

    return () => {
      active = false;
    };
  }, []);

  if (!show) return null;

  return (
    <Link
      href="/staff"
      className="fixed right-4 top-4 z-[110] rounded-xl border border-yellow-400/40 bg-black/85 px-3 py-2 text-xs font-bold uppercase tracking-wide text-yellow-400 shadow-xl backdrop-blur-md transition hover:bg-yellow-400 hover:text-black"
    >
      Staff Tools
    </Link>
  );
}
