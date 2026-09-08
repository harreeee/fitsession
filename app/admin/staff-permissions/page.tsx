"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { staffFetch } from "@/lib/staffFetch";

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  can_view_revenue: boolean;
  can_view_clients: boolean;
  can_view_booked_calendar: boolean;
};

type StaffResponse = { staff: StaffRow[] };

export default function StaffPermissionsPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await staffFetch<StaffResponse>("/api/admin/staff-permissions");
      setStaff(data.staff);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load permissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(row: StaffRow, key: "can_view_revenue" | "can_view_clients" | "can_view_booked_calendar") {
    const next = { ...row, [key]: !row[key] };
    setStaff((current) => current.map((item) => item.id === row.id ? next : item));
    setSaving(row.id);
    setMessage("");

    try {
      await staffFetch("/api/admin/staff-permissions", {
        method: "PATCH",
        body: JSON.stringify({
          staffId: row.id,
          canViewRevenue: next.can_view_revenue,
          canViewClients: next.can_view_clients,
          canViewBookedCalendar: next.can_view_booked_calendar,
        }),
      });
      setMessage(`Permissions saved for ${row.full_name || row.email || "staff"}.`);
    } catch (error) {
      setStaff((current) => current.map((item) => item.id === row.id ? row : item));
      setMessage(error instanceof Error ? error.message : "Could not save permissions.");
    } finally {
      setSaving(null);
    }
  }

  const Toggle = ({ row, field, label }: { row: StaffRow; field: "can_view_revenue" | "can_view_clients" | "can_view_booked_calendar"; label: string }) => (
    <button
      type="button"
      disabled={saving === row.id}
      onClick={() => void toggle(row, field)}
      aria-pressed={row[field]}
      className={`min-w-28 rounded-full border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
        row[field]
          ? "border-green-400/40 bg-green-400/15 text-green-300"
          : "border-white/15 bg-white/5 text-gray-400"
      }`}
    >
      {label}: {row[field] ? "ON" : "OFF"}
    </button>
  );

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-5 md:p-8">
        <div className="mx-auto max-w-6xl pt-20 md:pt-16">
          <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-yellow-400">FXA FITNESS</p>
              <h1 className="mt-2 text-4xl font-black md:text-6xl">Staff Permissions</h1>
              <p className="mt-3 text-sm text-gray-400">Admin-only. These permissions are view-only and apply individually.</p>
            </div>
            <Link href="/staff" className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-sm font-bold text-yellow-400">Back to Staff Tools</Link>
          </header>

          {message ? <p role="status" className="mb-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm">{message}</p> : null}

          {loading ? <p className="text-gray-400">Loading staff...</p> : (
            <div className="space-y-3">
              {staff.map((row) => (
                <article key={row.id} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <h2 className="text-xl font-black">{row.full_name || "Unnamed staff"}</h2>
                      <p className="mt-1 text-xs text-gray-500">{row.email || "No email"} · {row.role === "nutrition_coach" ? "Nutrition Coach" : "Trainer"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Toggle row={row} field="can_view_revenue" label="Revenue" />
                      <Toggle row={row} field="can_view_clients" label="Clients" />
                      <Toggle row={row} field="can_view_booked_calendar" label="Calendar" />
                    </div>
                  </div>
                </article>
              ))}
              {!staff.length ? <p className="text-gray-400">No trainers or nutrition coaches found.</p> : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
