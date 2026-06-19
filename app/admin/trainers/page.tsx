"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type TrainerSessionHistory = {
  id: string;
  client_id: string;
  client_name: string;
  client_email: string | null;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string;
};

type StaffMember = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
  total_sessions_this_month: number;
  recent_session_history: TrainerSessionHistory[];
};

function getRoleLabel(role: string | null) {
  if (role === "admin") return "Admin";
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "client") return "Client";
  return "Unknown";
}

function getRoleBadgeClass(role: string | null) {
  if (role === "nutrition_coach") {
    return "bg-green-400 text-black";
  }

  if (role === "trainer") {
    return "bg-yellow-400 text-black";
  }

  return "bg-gray-400 text-black";
}

export default function AdminTrainersPage() {
  const router = useRouter();

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("trainer");

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  }

  async function fetchStaffMembers() {
    setLoading(true);
    setMessage("");

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/admin/trainers", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result: { trainers?: StaffMember[]; error?: string } =
      await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not load staff members.");
      setLoading(false);
      return;
    }

    setStaffMembers(result.trainers || []);
    setLoading(false);
  }

  async function handleAddStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim()) {
      setMessage("Full name is required.");
      return;
    }

    if (!email.trim()) {
      setMessage("Email is required.");
      return;
    }

    if (!password || password.length < 6) {
      setMessage("Temporary password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setMessage("");

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const response = await fetch("/api/admin/trainers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        role: newStaffRole,
      }),
    });

    const result: { error?: string } = await response.json();
    console.log("Create staff response:", response.status, result);

    if (!response.ok) {
      setMessage(result.error || "Could not add staff member.");
      setSaving(false);
      return;
    }

    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setNewStaffRole("trainer");

    setMessage(`${getRoleLabel(newStaffRole)} added successfully.`);
    setSaving(false);
    await fetchStaffMembers();
  }

  async function handleRemoveStaff(staffId: string, staffName: string) {
    const confirmed = window.confirm(
      `Remove staff access for ${staffName}? Old session history will stay saved.`
    );

    if (!confirmed) return;

    setMessage("");

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const response = await fetch(`/api/admin/trainers?id=${staffId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result: { error?: string } = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Could not remove staff access.");
      return;
    }

    setMessage("Staff access removed.");
    await fetchStaffMembers();
  }

  function formatDateTime(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

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
        return;
      }

      setCheckingRole(false);
      await fetchStaffMembers();
    }

    protectPage();
  }, [router]);

  const trainerCount = staffMembers.filter(
    (staff) => staff.role === "trainer"
  ).length;

  const nutritionCoachCount = staffMembers.filter(
    (staff) => staff.role === "nutrition_coach"
  ).length;

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-black text-yellow-400">Checking admin access...</p>
        </div>
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
                Staff Management
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Add trainers and nutrition coaches, view contact info, monthly
                sessions, and recent session history.
              </p>
            </div>

            <Link
              href="/admin"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Admin
            </Link>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Total Staff
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {staffMembers.length}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Trainers
              </p>

              <p className="mt-3 text-5xl font-black text-yellow-400">
                {trainerCount}
              </p>
            </div>

            <div className="rounded-3xl border border-green-500/30 bg-white/[0.07] p-5 text-center shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Nutrition Coaches
              </p>

              <p className="mt-3 text-5xl font-black text-green-300">
                {nutritionCoachCount}
              </p>
            </div>
          </section>

          {message ? (
            <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-300">
              {message}
            </div>
          ) : null}

          <section className="mb-8 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
            <h2 className="text-2xl font-black">Add Staff Member</h2>

            <p className="mt-2 text-sm font-medium text-gray-400">
              Choose whether this account is a Trainer or Nutrition Coach.
              Nutrition coaches can use the scanner and access client info after
              you update route permissions.
            </p>

            <form
              onSubmit={handleAddStaff}
              className="mt-5 grid gap-4 md:grid-cols-6"
            >
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                placeholder="Full name"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400 md:col-span-2"
              />

              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                placeholder="Email"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400 md:col-span-2"
              />

              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
              />

              <select
                value={newStaffRole}
                onChange={(event) => setNewStaffRole(event.target.value)}
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="trainer">Trainer</option>
                <option value="nutrition_coach">Nutrition Coach</option>
              </select>

              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                type="password"
                placeholder="Temporary password"
                className="rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-gray-500 focus:border-yellow-400 md:col-span-4"
              />

              <button
                disabled={saving}
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
              >
                {saving ? "Adding..." : `Add ${getRoleLabel(newStaffRole)}`}
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black">Current Staff</h2>

              <p className="rounded-full border border-yellow-500/30 px-4 py-2 text-sm font-black text-yellow-400">
                {staffMembers.length} total
              </p>
            </div>

            {loading ? (
              <p className="font-black text-yellow-400">Loading staff...</p>
            ) : staffMembers.length === 0 ? (
              <p className="text-sm font-medium text-gray-400">
                No staff members found yet.
              </p>
            ) : (
              <div className="space-y-4">
                {staffMembers.map((staff) => {
                  const isExpanded = expandedStaffId === staff.id;

                  return (
                    <div
                      key={staff.id}
                      className="rounded-[2rem] border border-yellow-500/20 bg-black/40 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xl font-black">
                              {staff.full_name || "Unnamed Staff"}
                            </p>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${getRoleBadgeClass(
                                staff.role
                              )}`}
                            >
                              {getRoleLabel(staff.role)}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 text-sm font-bold text-gray-400 md:grid-cols-2">
                            <p>Email: {staff.email || "No email saved"}</p>
                            <p>Phone: {staff.phone || "No phone saved"}</p>
                            <p>
                              Added:{" "}
                              {staff.created_at
                                ? new Date(staff.created_at).toLocaleDateString()
                                : "Unknown"}
                            </p>
                            <p className="text-yellow-400">
                              This Month:{" "}
                              {staff.total_sessions_this_month} sessions
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:min-w-44">
                          <button
                            onClick={() =>
                              setExpandedStaffId(isExpanded ? null : staff.id)
                            }
                            className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
                          >
                            {isExpanded ? "Hide History" : "View History"}
                          </button>

                          <button
                            onClick={() =>
                              handleRemoveStaff(
                                staff.id,
                                staff.full_name ||
                                  staff.email ||
                                  getRoleLabel(staff.role)
                              )
                            }
                            className="rounded-2xl border border-red-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-red-300 transition hover:bg-red-400 hover:text-black"
                          >
                            Remove Access
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-black/50 p-4">
                          <h3 className="mb-4 text-lg font-black text-yellow-400">
                            Recent Session History
                          </h3>

                          {staff.recent_session_history.length === 0 ? (
                            <p className="text-sm font-medium text-gray-400">
                              No recent session history for this staff member.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {staff.recent_session_history.map((log) => (
                                <div
                                  key={log.id}
                                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                                >
                                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="font-black">
                                        {log.client_name}
                                      </p>

                                      <p className="text-xs font-bold text-gray-500">
                                        {log.client_email || "No client email"}
                                      </p>
                                    </div>

                                    <p className="text-sm font-black text-yellow-400">
                                      {formatDateTime(log.scanned_at)}
                                    </p>
                                  </div>

                                  <div className="mt-3 grid gap-2 text-sm font-bold text-gray-400 md:grid-cols-3">
                                    <p>Status: {log.status}</p>

                                    <p>
                                      Remaining After:{" "}
                                      {log.remaining_after ?? "N/A"}
                                    </p>

                                    <p>{log.message || "Session scanned"}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}