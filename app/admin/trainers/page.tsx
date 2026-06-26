"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type StaffRole = "trainer" | "nutrition_coach";

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
};

type SessionHistoryRow = {
  id: string;
  trainer_id: string | null;
  created_at: string | null;
};

type StaffTableRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  totalSessions: number;
  monthlySessions: number;
  joinedDate: string | null;
};

type Column = {
  key:
    | "name"
    | "email"
    | "phone"
    | "role"
    | "totalSessions"
    | "monthlySessions"
    | "joinedDate";
  label: string;
  width: string;
  align?: "left" | "right" | "center";
};

const columns: Column[] = [
  { key: "name", label: "Name", width: "w-[220px]" },
  { key: "email", label: "Email", width: "w-[260px]" },
  { key: "phone", label: "Phone", width: "w-[150px]" },
  { key: "role", label: "Role", width: "w-[170px]" },
  { key: "totalSessions", label: "Total", width: "w-[110px]", align: "right" },
  {
    key: "monthlySessions",
    label: "This Month",
    width: "w-[130px]",
    align: "right",
  },
  { key: "joinedDate", label: "Joined", width: "w-[130px]" },
];

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function getTime(value: string | null) {
  if (!value) return 0;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
}

function getCurrentMonthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function getRoleLabel(role: string | null) {
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  return "-";
}

function getRoleBadgeClass(role: string | null) {
  if (role === "trainer") {
    return "border-yellow-400/40 bg-yellow-400/10 text-yellow-300";
  }

  if (role === "nutrition_coach") {
    return "border-green-400/40 bg-green-400/10 text-green-300";
  }

  return "border-gray-400/40 bg-gray-400/10 text-gray-300";
}

export default function AdminTrainersPage() {
  const router = useRouter();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [sessions, setSessions] = useState<SessionHistoryRow[]>([]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("trainer");

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking admin access..."
  );
  const [loading, setLoading] = useState(true);
  const [addingStaff, setAddingStaff] = useState(false);

  async function fetchStaffPageData() {
    setLoading(true);

    const [staffResult, sessionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at")
        .in("role", ["trainer", "nutrition_coach"])
        .order("created_at", { ascending: false }),

      supabase
        .from("session_history")
        .select("id, trainer_id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (staffResult.error) {
      alert(staffResult.error.message);
      setLoading(false);
      return;
    }

    if (sessionResult.error) {
      console.error(sessionResult.error.message);
      setSessions([]);
    } else {
      setSessions((sessionResult.data || []) as SessionHistoryRow[]);
    }

    setStaff((staffResult.data || []) as StaffRow[]);
    setLoading(false);
  }

  async function addStaffMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim()) {
      alert("Full name is required.");
      return;
    }

    if (!email.trim()) {
      alert("Email is required.");
      return;
    }

    if (!password.trim()) {
      alert("Temporary password is required.");
      return;
    }

    setAddingStaff(true);

    const response = await fetch("/api/admin/trainers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        password: password.trim(),
        role,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
  console.error("Add staff error:", result);
  alert(result?.error || `Could not add staff member. Status: ${response.status}`);
  setAddingStaff(false);
  return;
}

    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole("trainer");

    alert("Staff member added.");
    await fetchStaffPageData();
    setAddingStaff(false);
  }

  async function updateStaffRole(staffId: string, nextRole: StaffRole) {
    const { error } = await supabase
      .from("profiles")
      .update({
        role: nextRole,
      })
      .eq("id", staffId);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchStaffPageData();
  }

  async function deleteStaff(staffId: string) {
    const confirmed = window.confirm(
      "Remove this staff profile? This removes the profile row only."
    );

    if (!confirmed) return;

    const { error } = await supabase.from("profiles").delete().eq("id", staffId);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchStaffPageData();
  }

  const tableRows = useMemo((): StaffTableRow[] => {
  const monthStart = getCurrentMonthStartIso();

  const rows: StaffTableRow[] = staff.map((staffMember) => {
    const staffSessions = sessions.filter(
      (session) => session.trainer_id === staffMember.id
    );

    const monthlySessions = staffSessions.filter(
      (session) => getTime(session.created_at) >= getTime(monthStart)
    );

    return {
      id: staffMember.id,
      name: staffMember.full_name || "-",
      email: staffMember.email || "-",
      phone: staffMember.phone || "-",
      role:
        staffMember.role === "nutrition_coach"
          ? "nutrition_coach"
          : "trainer",
      totalSessions: staffSessions.length,
      monthlySessions: monthlySessions.length,
      joinedDate: staffMember.created_at,
    };
  });

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}, [staff, sessions]);

  const trainerCount = tableRows.filter((row) => row.role === "trainer").length;

  const nutritionCoachCount = tableRows.filter(
    (row) => row.role === "nutrition_coach"
  ).length;

  const totalSessions = tableRows.reduce(
    (sum, row) => sum + row.totalSessions,
    0
  );

  const totalMonthlySessions = tableRows.reduce(
    (sum, row) => sum + row.monthlySessions,
    0
  );

  useEffect(() => {
    async function protectPage() {
      const { user, role: currentRole } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (currentRole !== "admin") {
        if (currentRole === "trainer" || currentRole === "nutrition_coach") {
          router.push("/trainer/scan");
          return;
        }

        if (currentRole === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingRole(false);
      await fetchStaffPageData();
    }

    protectPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-3 text-white md:p-5">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4">
        <div className="mx-auto max-w-[108rem]">
          <header className="mb-4 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  Staff Management
                </h1>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Add trainers and nutrition coaches, view contact info, and
                  track session activity.
                </p>
              </div>

              <Link
                href="/admin"
                className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
              >
                Back to Admin
              </Link>
            </div>
          </header>

          <section className="mb-4 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Total Staff
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-400">
                {tableRows.length}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Trainers
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-300">
                {trainerCount}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Nutrition
              </p>
              <p className="mt-1 text-3xl font-semibold text-green-300">
                {nutritionCoachCount}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Sessions
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-300">
                {totalSessions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                This Month
              </p>
              <p className="mt-1 text-3xl font-semibold text-orange-300">
                {totalMonthlySessions}
              </p>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5">
            <h2 className="text-2xl font-semibold text-yellow-400">
              Add Staff Member
            </h2>

            <p className="mt-1 text-sm font-normal text-gray-400">
              Create trainer or nutrition coach access.
            </p>

            <form onSubmit={addStaffMember} className="mt-4">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.75fr]">
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Phone"
                  className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as StaffRole)}
                  className="w-full rounded-xl border border-white/15 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-400"
                >
                  <option value="trainer" className="bg-white text-black">
                    Trainer
                  </option>
                  <option value="nutrition_coach" className="bg-white text-black">
                    Nutrition Coach
                  </option>
                </select>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_260px]">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Temporary password"
                  className="w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                />

                <button
                  type="submit"
                  disabled={addingStaff}
                  className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
                >
                  {addingStaff
                    ? "Adding..."
                    : role === "nutrition_coach"
                    ? "Add Nutrition Coach"
                    : "Add Trainer"}
                </button>
              </div>
            </form>
          </section>

          {loading ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center">
              <p className="text-sm font-normal text-yellow-400">
                Loading staff...
              </p>
            </section>
          ) : tableRows.length === 0 ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center">
              <p className="text-sm font-normal text-yellow-400">
                No staff found.
              </p>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-yellow-500/30 bg-black/65 shadow-2xl">
              <div className="border-b border-yellow-500/30 bg-black px-4 py-3">
                <p className="text-xs font-normal uppercase tracking-widest text-yellow-400">
                  Showing {tableRows.length} staff
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1160px] table-fixed border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-yellow-400 text-black">
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className={`${column.width} border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase last:border-r-0 ${
                            column.align === "right"
                              ? "text-right"
                              : column.align === "center"
                              ? "text-center"
                              : "text-left"
                          }`}
                        >
                          {column.label}
                        </th>
                      ))}

                      <th className="w-[170px] px-3 py-3 text-right text-xs font-semibold uppercase">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {tableRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`border-b border-white/10 ${
                          index % 2 === 0 ? "bg-[#101010]" : "bg-[#171717]"
                        } hover:bg-yellow-400/10`}
                      >
                        <td className="border-r border-white/15 px-3 py-3 text-xs font-normal text-white">
                          <span className="block truncate">{row.name}</span>
                        </td>

                        <td className="border-r border-white/15 px-3 py-3 text-xs font-normal text-gray-200">
                          <span className="block truncate">{row.email}</span>
                        </td>

                        <td className="border-r border-white/15 px-3 py-3 text-xs font-normal text-gray-200">
                          <span className="block truncate">{row.phone}</span>
                        </td>

                        <td className="border-r border-white/15 px-3 py-3">
                          <select
                            value={row.role}
                            onChange={(event) =>
                              updateStaffRole(
                                row.id,
                                event.target.value as StaffRole
                              )
                            }
                            className={`w-full rounded-md border px-2 py-1 text-xs font-normal outline-none ${getRoleBadgeClass(
                              row.role
                            )}`}
                          >
                            <option value="trainer" className="bg-white text-black">
                              Trainer
                            </option>
                            <option
                              value="nutrition_coach"
                              className="bg-white text-black"
                            >
                              Nutrition Coach
                            </option>
                          </select>
                        </td>

                        <td className="border-r border-white/15 px-3 py-3 text-right text-xs font-normal text-yellow-300">
                          {row.totalSessions}
                        </td>

                        <td className="border-r border-white/15 px-3 py-3 text-right text-xs font-normal text-orange-300">
                          {row.monthlySessions}
                        </td>

                        <td className="border-r border-white/15 px-3 py-3 text-xs font-normal text-gray-200">
                          {formatDate(row.joinedDate)}
                        </td>

                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => deleteStaff(row.id)}
                            className="rounded-md border border-red-400/50 px-3 py-1.5 text-xs font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}