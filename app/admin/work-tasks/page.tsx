"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type AdminTab = "tasks" | "reports" | "checkins" | "qr";
type Priority = "low" | "normal" | "high" | "urgent";
type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "trainer" | "nutrition_coach" | "marketing_manager";
};

type WorkTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  task_date: string;
  due_at: string | null;
  priority: Priority;
  status: TaskStatus;
  report_required: boolean;
  completed_at: string | null;
  created_at: string;
};

type WorkReport = {
  id: string;
  staff_id: string;
  task_id: string | null;
  work_date: string;
  report_type: "daily" | "task_completion";
  title: string;
  summary: string;
  completed_items: string | null;
  blockers: string | null;
  next_steps: string | null;
  status: "submitted" | "reviewed";
  admin_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type WorkCheckin = {
  id: string;
  staff_id: string;
  code_id: string;
  work_date: string;
  method: string;
  checkin_at: string;
};

type CheckinCode = {
  id: string;
  label: string;
  qr_token: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

type RotateCodeRpcRow = {
  code_id: string;
  qr_token: string;
  code_label: string;
};

function todayValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleLabel(role: string) {
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "marketing_manager") return "Marketing";
  return role;
}

function priorityClass(priority: Priority) {
  if (priority === "urgent") return "border-red-400/40 bg-red-400/10 text-red-300";
  if (priority === "high") return "border-orange-400/40 bg-orange-400/10 text-orange-300";
  if (priority === "low") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

function statusClass(status: string) {
  if (status === "completed" || status === "reviewed") {
    return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
  }
  if (status === "in_progress") {
    return "border-cyan-400/35 bg-cyan-400/10 text-cyan-300";
  }
  if (status === "cancelled") {
    return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  }
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

export default function AdminWorkTasksPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("tasks");
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [checkins, setCheckins] = useState<WorkCheckin[]>([]);
  const [codes, setCodes] = useState<CheckinCode[]>([]);
  const [qrImage, setQrImage] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [taskDate, setTaskDate] = useState(todayValue());
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [reportRequired, setReportRequired] = useState(true);
  const [creatingTask, setCreatingTask] = useState(false);
  const [rotatingCode, setRotatingCode] = useState(false);
  const [search, setSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | TaskStatus>("all");

  const staffMap = useMemo(
    () => new Map(staff.map((row) => [row.id, row])),
    [staff],
  );

  const taskMap = useMemo(
    () => new Map(tasks.map((row) => [row.id, row])),
    [tasks],
  );

  const activeCode = useMemo(
    () => codes.find((code) => code.is_active) || null,
    [codes],
  );

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (taskStatusFilter !== "all" && task.status !== taskStatusFilter) return false;
      if (!query) return true;
      const person = staffMap.get(task.assigned_to);
      return [task.title, task.description, person?.full_name, person?.email, task.status]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, staffMap, taskStatusFilter, tasks]);

  const today = todayValue();
  const todayCheckinCount = checkins.filter((row) => row.work_date === today).length;
  const todayReportCount = reports.filter((row) => row.work_date === today).length;
  const openTaskCount = tasks.filter(
    (row) => row.status === "pending" || row.status === "in_progress",
  ).length;
  const overdueTaskCount = tasks.filter((row) => {
    if (row.status === "completed" || row.status === "cancelled") return false;
    if (row.due_at) return new Date(row.due_at).getTime() < Date.now();
    return row.task_date < today;
  }).length;

  async function buildQr(token: string | null | undefined) {
    const cleanToken = String(token || "").trim();
    if (!cleanToken) {
      setQrImage("");
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(cleanToken, {
        errorCorrectionLevel: "H",
        width: 700,
        margin: 2,
      });
      setQrImage(dataUrl);
    } catch (error) {
      console.error("Could not generate work QR:", error);
      setQrImage("");
    }
  }

  async function loadData() {
    setLoading(true);

    const [staffResult, taskResult, reportResult, checkinResult, codeResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["trainer", "nutrition_coach", "marketing_manager"])
          .order("full_name", { ascending: true }),
        supabase
          .from("staff_tasks")
          .select(
            "id, title, description, assigned_to, assigned_by, task_date, due_at, priority, status, report_required, completed_at, created_at",
          )
          .order("task_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("staff_work_reports")
          .select(
            "id, staff_id, task_id, work_date, report_type, title, summary, completed_items, blockers, next_steps, status, admin_comment, reviewed_by, reviewed_at, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("staff_work_checkins")
          .select("id, staff_id, code_id, work_date, method, checkin_at")
          .order("checkin_at", { ascending: false })
          .limit(500),
        supabase
          .from("staff_checkin_codes")
          .select("id, label, qr_token, is_active, created_by, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const firstError =
      staffResult.error ||
      taskResult.error ||
      reportResult.error ||
      checkinResult.error ||
      codeResult.error;

    if (firstError) {
      setMessageType("error");
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const nextStaff = (staffResult.data || []) as StaffProfile[];
    const nextTasks = (taskResult.data || []) as WorkTask[];
    const nextReports = (reportResult.data || []) as WorkReport[];
    const nextCheckins = (checkinResult.data || []) as WorkCheckin[];
    const nextCodes = (codeResult.data || []) as CheckinCode[];

    setStaff(nextStaff);
    setTasks(nextTasks);
    setReports(nextReports);
    setCheckins(nextCheckins);
    setCodes(nextCodes);
    setAssignedTo((current) => current || nextStaff[0]?.id || "");
    await buildQr(nextCodes.find((code) => code.is_active)?.qr_token);
    setLoading(false);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !assignedTo || !taskDate) {
      setMessageType("error");
      setMessage("Title, assigned staff, and task date are required.");
      return;
    }

    setCreatingTask(true);
    setMessage("");
    setMessageType("");

    const dueAt = dueTime
      ? new Date(`${taskDate}T${dueTime}:00`).toISOString()
      : null;

    const { error } = await supabase.from("staff_tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      assigned_to: assignedTo,
      assigned_by: adminId,
      task_date: taskDate,
      due_at: dueAt,
      priority,
      status: "pending",
      report_required: reportRequired,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      setCreatingTask(false);
      return;
    }

    setMessageType("success");
    setMessage("Task created and assigned successfully.");
    setTitle("");
    setDescription("");
    setPriority("normal");
    setReportRequired(true);
    setDueTime("");
    await loadData();
    setCreatingTask(false);
  }

  async function updateTaskStatus(task: WorkTask, status: TaskStatus) {
    setMessage("");
    setMessageType("");

    const payload: {
      status: TaskStatus;
      completed_at: string | null;
      updated_at: string;
    } = {
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("staff_tasks")
      .update(payload)
      .eq("id", task.id);

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      return;
    }

    setMessageType("success");
    setMessage(`Task updated to ${status.replaceAll("_", " ")}.`);
    await loadData();
  }

  async function reviewReport(report: WorkReport) {
    const comment = window.prompt(
      "Admin review comment (optional):",
      report.admin_comment || "",
    );
    if (comment === null) return;

    const { error } = await supabase
      .from("staff_work_reports")
      .update({
        status: "reviewed",
        admin_comment: comment.trim() || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      return;
    }

    setMessageType("success");
    setMessage("Report reviewed.");
    await loadData();
  }

  async function rotateQrCode() {
    const ok = window.confirm(
      activeCode
        ? "Rotate the staff work QR code? The current code will stop working immediately."
        : "Create the first staff work QR code?",
    );
    if (!ok) return;

    setRotatingCode(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("rotate_staff_checkin_code", {
      p_label: "FXA Daily Work Check-in",
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      setRotatingCode(false);
      return;
    }

    const raw = Array.isArray(data) ? data[0] : data;
    const row = raw as RotateCodeRpcRow | null;
    if (row?.qr_token) await buildQr(row.qr_token);

    setMessageType("success");
    setMessage(activeCode ? "QR code rotated." : "QR code created.");
    await loadData();
    setRotatingCode(false);
  }

  useEffect(() => {
    async function protect() {
      const { user, role } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      if (role === "manager") {
        router.push("/history/work");
        return;
      }
      if (role !== "admin") {
        if (
          role === "trainer" ||
          role === "nutrition_coach" ||
          role === "marketing_manager"
        ) {
          router.push("/work");
          return;
        }
        router.push(role === "client" ? "/client" : "/login");
        return;
      }

      setAdminId(user.id);
      setCheckingRole(false);
      await loadData();
    }

    void protect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Checking Admin access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.13),_transparent_38%),#0b0b0b] p-5 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-400">
                FXA FITNESS · WORK MANAGEMENT
              </p>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">Daily Work & Staff Tasks</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Assign daily work, review completion reports, and manage the QR used by PT, Nutrition Coach, and Marketing staff for daily check-in.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/history/work"
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200"
              >
                Work History
              </Link>
              <Link
                href="/admin"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-zinc-300"
              >
                Admin Dashboard
              </Link>
              <button
                type="button"
                onClick={() => loadData()}
                className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-black text-black"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-2xl border border-yellow-400/20 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Open Tasks</p>
              <p className="mt-2 text-3xl font-black text-yellow-400">{openTaskCount}</p>
            </div>
            <div className="rounded-2xl border border-red-400/20 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Overdue</p>
              <p className="mt-2 text-3xl font-black text-red-300">{overdueTaskCount}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Today Check-ins</p>
              <p className="mt-2 text-3xl font-black text-emerald-300">{todayCheckinCount}</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Today Reports</p>
              <p className="mt-2 text-3xl font-black text-cyan-300">{todayReportCount}</p>
            </div>
          </div>
        </header>

        {message ? (
          <div className={`mt-4 rounded-2xl border p-4 text-sm ${messageType === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-red-400/30 bg-red-400/10 text-red-200"}`}>
            {message}
          </div>
        ) : null}

        <nav className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            ["tasks", "Tasks"],
            ["reports", "Reports"],
            ["checkins", "Check-ins"],
            ["qr", "Check-in QR"],
          ] as Array<[AdminTab, string]>).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`min-h-12 rounded-xl border px-3 text-sm font-black ${activeTab === tab ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-[#0d0d0d] text-zinc-300"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "tasks" ? (
          <section className="mt-4 grid gap-4 xl:grid-cols-[390px_1fr]">
            <form onSubmit={createTask} className="h-fit rounded-3xl border border-yellow-400/20 bg-[#0d0d0d] p-5 xl:sticky xl:top-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">Create Task</p>
              <h2 className="mt-1 text-2xl font-black">Assign Work</h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase text-zinc-500">Task Title *</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-black px-4 text-base outline-none focus:border-yellow-400"
                    placeholder="Example: Follow up all trial leads"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase text-zinc-500">Description</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-28 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-base outline-none focus:border-yellow-400"
                    placeholder="Expected result, instructions, KPI, or deliverable..."
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase text-zinc-500">Assign To *</label>
                  <select
                    value={assignedTo}
                    onChange={(event) => setAssignedTo(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-black px-4 text-base outline-none focus:border-yellow-400"
                  >
                    <option value="">Choose staff...</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name || person.email || "Staff"} — {roleLabel(person.role)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase text-zinc-500">Task Date *</label>
                    <input
                      type="date"
                      value={taskDate}
                      onChange={(event) => setTaskDate(event.target.value)}
                      className="min-h-12 w-full rounded-xl border border-white/15 bg-black px-3 text-sm outline-none focus:border-yellow-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase text-zinc-500">Due Time</label>
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(event) => setDueTime(event.target.value)}
                      className="min-h-12 w-full rounded-xl border border-white/15 bg-black px-3 text-sm outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase text-zinc-500">Priority</label>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as Priority)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-black px-4 text-base outline-none focus:border-yellow-400"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 p-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={reportRequired}
                    onChange={(event) => setReportRequired(event.target.checked)}
                    className="h-5 w-5 accent-yellow-400"
                  />
                  Completion report required
                </label>
                <button
                  type="submit"
                  disabled={creatingTask || !title.trim() || !assignedTo}
                  className="min-h-12 w-full rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black disabled:opacity-40"
                >
                  {creatingTask ? "Creating..." : "Create & Assign Task"}
                </button>
              </div>
            </form>

            <div>
              <div className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_190px]">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    type="search"
                    placeholder="Search task or employee..."
                    className="min-h-12 rounded-xl border border-white/15 bg-black px-4 text-base outline-none focus:border-yellow-400"
                  />
                  <select
                    value={taskStatusFilter}
                    onChange={(event) => setTaskStatusFilter(event.target.value as "all" | TaskStatus)}
                    className="min-h-12 rounded-xl border border-white/15 bg-black px-4 text-base outline-none focus:border-yellow-400"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {filteredTasks.map((task) => {
                  const person = staffMap.get(task.assigned_to);
                  return (
                    <article key={task.id} className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-4 md:p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${priorityClass(task.priority)}`}>
                              {task.priority}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusClass(task.status)}`}>
                              {task.status.replaceAll("_", " ")}
                            </span>
                            {task.report_required ? (
                              <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-1 text-[9px] font-black uppercase text-violet-300">Report Required</span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-lg font-black">{task.title}</h3>
                          <p className="mt-1 text-sm font-bold text-yellow-300">
                            {person?.full_name || person?.email || "Unknown Staff"}
                            <span className="ml-2 text-xs font-medium text-zinc-500">{person ? roleLabel(person.role) : ""}</span>
                          </p>
                          {task.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{task.description}</p> : null}
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                            <span>Task date: {formatDate(task.task_date)}</span>
                            <span>Due: {formatDateTime(task.due_at)}</span>
                            {task.completed_at ? <span>Completed: {formatDateTime(task.completed_at)}</span> : null}
                          </div>
                        </div>

                        <div className="grid shrink-0 grid-cols-2 gap-2 md:w-56">
                          {task.status !== "completed" && task.status !== "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task, "completed")}
                              className="min-h-11 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 text-xs font-black text-emerald-300"
                            >
                              Complete
                            </button>
                          ) : null}
                          {task.status !== "cancelled" && task.status !== "completed" ? (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task, "cancelled")}
                              className="min-h-11 rounded-xl border border-red-400/30 bg-red-400/10 px-3 text-xs font-black text-red-300"
                            >
                              Cancel
                            </button>
                          ) : null}
                          {task.status === "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task, "pending")}
                              className="col-span-2 min-h-11 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 text-xs font-black text-yellow-300"
                            >
                              Reopen
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}

                {!loading && filteredTasks.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">No tasks found.</div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "reports" ? (
          <section className="mt-4">
            <div className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">Staff Reports</p>
                  <h2 className="mt-1 text-2xl font-black">Daily & Task Completion Reports</h2>
                </div>
                <p className="text-xs text-zinc-500">{reports.length} records loaded</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {reports.map((report) => {
                const person = staffMap.get(report.staff_id);
                const task = report.task_id ? taskMap.get(report.task_id) : null;
                return (
                  <article key={report.id} className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-[9px] font-black uppercase text-yellow-300">
                            {report.report_type === "task_completion" ? "Task Report" : "Daily Report"}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusClass(report.status)}`}>
                            {report.status}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-black">{report.title}</h3>
                        <p className="mt-1 text-sm font-bold text-yellow-300">{person?.full_name || person?.email || "Unknown Staff"}</p>
                        <p className="mt-1 text-xs text-zinc-500">{formatDate(report.work_date)} · {formatDateTime(report.created_at)}</p>
                      </div>
                      {report.status !== "reviewed" ? (
                        <button
                          type="button"
                          onClick={() => reviewReport(report)}
                          className="shrink-0 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-black"
                        >
                          Review
                        </button>
                      ) : null}
                    </div>

                    {task ? (
                      <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3 text-xs text-violet-200">Assigned task: {task.title}</div>
                    ) : null}

                    <div className="mt-4 space-y-3 text-sm leading-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Summary</p>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-300">{report.summary}</p>
                      </div>
                      {report.completed_items ? (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-500/70">Completed</p>
                          <p className="mt-1 whitespace-pre-wrap text-zinc-300">{report.completed_items}</p>
                        </div>
                      ) : null}
                      {report.blockers ? (
                        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3">
                          <p className="text-[10px] font-black uppercase text-red-300">Blockers</p>
                          <p className="mt-1 whitespace-pre-wrap text-red-100/80">{report.blockers}</p>
                        </div>
                      ) : null}
                      {report.next_steps ? (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-500/70">Next Steps</p>
                          <p className="mt-1 whitespace-pre-wrap text-zinc-300">{report.next_steps}</p>
                        </div>
                      ) : null}
                      {report.admin_comment ? (
                        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
                          <p className="text-[10px] font-black uppercase text-cyan-300">Admin Review</p>
                          <p className="mt-1 whitespace-pre-wrap text-cyan-100/80">{report.admin_comment}</p>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "checkins" ? (
          <section className="mt-4">
            <div className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">Daily Attendance</p>
              <h2 className="mt-1 text-2xl font-black">Work Check-ins</h2>
            </div>

            <div className="mt-3 overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-yellow-400 text-black">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black uppercase">Work Date</th>
                      <th className="px-4 py-3 text-xs font-black uppercase">Employee</th>
                      <th className="px-4 py-3 text-xs font-black uppercase">Role</th>
                      <th className="px-4 py-3 text-xs font-black uppercase">Checked In</th>
                      <th className="px-4 py-3 text-xs font-black uppercase">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkins.map((row, index) => {
                      const person = staffMap.get(row.staff_id);
                      return (
                        <tr key={row.id} className={`border-b border-white/10 ${index % 2 === 0 ? "bg-[#0d0d0d]" : "bg-[#121212]"}`}>
                          <td className="px-4 py-4 font-bold text-yellow-300">{formatDate(row.work_date)}</td>
                          <td className="px-4 py-4 text-white">{person?.full_name || person?.email || "Unknown Staff"}</td>
                          <td className="px-4 py-4 text-zinc-400">{person ? roleLabel(person.role) : "—"}</td>
                          <td className="px-4 py-4 text-zinc-300">{formatDateTime(row.checkin_at)}</td>
                          <td className="px-4 py-4"><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-300">QR</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "qr" ? (
          <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5 md:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">Staff Check-in QR</p>
              <h2 className="mt-1 text-2xl font-black">Current Daily Work Code</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Display this code at the workplace. Employees open Daily Work and scan it once per day. Rotating the code immediately disables the previous QR.
              </p>

              {activeCode ? (
                <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                  <p className="text-xs font-black uppercase text-emerald-300">Active</p>
                  <p className="mt-2 font-bold text-white">{activeCode.label}</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-zinc-600">{activeCode.qr_token}</p>
                  <p className="mt-2 text-xs text-zinc-500">Created {formatDateTime(activeCode.created_at)}</p>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-orange-400/25 bg-orange-400/[0.06] p-4 text-sm text-orange-200">
                  No active check-in QR exists yet.
                </div>
              )}

              <button
                type="button"
                onClick={rotateQrCode}
                disabled={rotatingCode}
                className="mt-5 min-h-12 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black disabled:opacity-50"
              >
                {rotatingCode ? "Generating..." : activeCode ? "Rotate QR Code" : "Create QR Code"}
              </button>
            </div>

            <div className="rounded-3xl border border-yellow-400/25 bg-[#0d0d0d] p-5 text-center">
              {qrImage ? (
                <>
                  <div className="rounded-3xl bg-white p-4">
                    <img src={qrImage} alt="FXA staff daily work check-in QR" className="mx-auto w-full max-w-[300px]" />
                  </div>
                  <p className="mt-4 text-sm font-black text-yellow-400">SCAN FOR DAILY WORK CHECK-IN</p>
                  <p className="mt-1 text-xs text-zinc-500">FXA FITNESS</p>
                </>
              ) : (
                <div className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-white/15 text-sm text-zinc-600">
                  Create an active QR code to display it here.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
