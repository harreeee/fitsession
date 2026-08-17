"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type WorkView = "reports" | "checkins" | "tasks";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type WorkTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  task_date: string;
  due_at: string | null;
  priority: string;
  status: string;
  report_required: boolean;
  completed_at: string | null;
  created_at: string;
};

type WorkReport = {
  id: string;
  staff_id: string;
  task_id: string | null;
  work_date: string;
  report_type: string;
  title: string;
  summary: string;
  completed_items: string | null;
  blockers: string | null;
  next_steps: string | null;
  status: string;
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

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart() {
  const date = new Date();
  date.setDate(1);
  return formatInputDate(date);
}

function todayValue() {
  return formatInputDate(new Date());
}

function weekStart() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return formatInputDate(date);
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
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleLabel(role: string | null) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "marketing_manager") return "Marketing";
  return "Staff";
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

function priorityClass(priority: string) {
  if (priority === "urgent") return "border-red-400/35 bg-red-400/10 text-red-300";
  if (priority === "high") return "border-orange-400/35 bg-orange-400/10 text-orange-300";
  if (priority === "low") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

export default function WorkHistoryPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [view, setView] = useState<WorkView>("reports");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [checkins, setCheckins] = useState<WorkCheckin[]>([]);
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(todayValue());
  const [search, setSearch] = useState("");
  const [filterLabel, setFilterLabel] = useState("This Month");
  const [errorMessage, setErrorMessage] = useState("");

  const profileMap = useMemo(
    () => new Map(profiles.map((row) => [row.id, row])),
    [profiles],
  );

  const taskMap = useMemo(
    () => new Map(tasks.map((row) => [row.id, row])),
    [tasks],
  );

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) => {
      const person = profileMap.get(report.staff_id);
      const task = report.task_id ? taskMap.get(report.task_id) : null;
      return [
        person?.full_name,
        person?.email,
        report.title,
        report.summary,
        report.completed_items,
        report.blockers,
        report.next_steps,
        report.admin_comment,
        task?.title,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [profileMap, reports, search, taskMap]);

  const filteredCheckins = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return checkins;
    return checkins.filter((row) => {
      const person = profileMap.get(row.staff_id);
      return [person?.full_name, person?.email, row.work_date, row.method]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [checkins, profileMap, search]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) => {
      const person = profileMap.get(task.assigned_to);
      return [
        person?.full_name,
        person?.email,
        task.title,
        task.description,
        task.priority,
        task.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [profileMap, search, tasks]);

  async function fetchWorkHistory(nextStart = startDate, nextEnd = endDate) {
    setLoading(true);
    setErrorMessage("");

    let reportQuery = supabase
      .from("staff_work_reports")
      .select(
        "id, staff_id, task_id, work_date, report_type, title, summary, completed_items, blockers, next_steps, status, admin_comment, reviewed_by, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    let checkinQuery = supabase
      .from("staff_work_checkins")
      .select("id, staff_id, code_id, work_date, method, checkin_at")
      .order("checkin_at", { ascending: false })
      .limit(1000);

    let taskQuery = supabase
      .from("staff_tasks")
      .select(
        "id, title, description, assigned_to, assigned_by, task_date, due_at, priority, status, report_required, completed_at, created_at",
      )
      .order("task_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);

    if (nextStart) {
      reportQuery = reportQuery.gte("work_date", nextStart);
      checkinQuery = checkinQuery.gte("work_date", nextStart);
      taskQuery = taskQuery.gte("task_date", nextStart);
    }
    if (nextEnd) {
      reportQuery = reportQuery.lte("work_date", nextEnd);
      checkinQuery = checkinQuery.lte("work_date", nextEnd);
      taskQuery = taskQuery.lte("task_date", nextEnd);
    }

    const [reportResult, checkinResult, taskResult, profileResult] = await Promise.all([
      reportQuery,
      checkinQuery,
      taskQuery,
      supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", [
          "admin",
          "manager",
          "trainer",
          "nutrition_coach",
          "marketing_manager",
        ])
        .order("full_name", { ascending: true }),
    ]);

    const firstError =
      reportResult.error || checkinResult.error || taskResult.error || profileResult.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setLoading(false);
      return;
    }

    setReports((reportResult.data || []) as WorkReport[]);
    setCheckins((checkinResult.data || []) as WorkCheckin[]);
    setTasks((taskResult.data || []) as WorkTask[]);
    setProfiles((profileResult.data || []) as ProfileRow[]);
    setLoading(false);
  }

  async function applyToday() {
    const value = todayValue();
    setStartDate(value);
    setEndDate(value);
    setFilterLabel("Today");
    await fetchWorkHistory(value, value);
  }

  async function applyWeek() {
    const start = weekStart();
    const end = todayValue();
    setStartDate(start);
    setEndDate(end);
    setFilterLabel("This Week");
    await fetchWorkHistory(start, end);
  }

  async function applyMonth() {
    const start = monthStart();
    const end = todayValue();
    setStartDate(start);
    setEndDate(end);
    setFilterLabel("This Month");
    await fetchWorkHistory(start, end);
  }

  async function applyAll() {
    setStartDate("");
    setEndDate("");
    setFilterLabel("All Time");
    await fetchWorkHistory("", "");
  }

  async function applyCustom() {
    if (startDate && endDate && startDate > endDate) {
      setErrorMessage("Start date cannot be after end date.");
      return;
    }
    setFilterLabel("Custom Range");
    await fetchWorkHistory(startDate, endDate);
  }

  useEffect(() => {
    async function protect() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      if (currentRole === "client") {
        router.push("/client");
        return;
      }
      if (
        currentRole !== "admin" &&
        currentRole !== "manager" &&
        currentRole !== "trainer" &&
        currentRole !== "nutrition_coach" &&
        currentRole !== "marketing_manager"
      ) {
        router.push("/login");
        return;
      }

      setRole(currentRole);
      setCheckingRole(false);
      await fetchWorkHistory(monthStart(), todayValue());
    }

    void protect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Loading work history...
      </main>
    );
  }

  const isManagement = role === "admin" || role === "manager";
  const completedTaskCount = tasks.filter((task) => task.status === "completed").length;
  const reviewedReportCount = reports.filter((report) => report.status === "reviewed").length;

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.13),_transparent_38%),#0b0b0b] p-5 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-yellow-400">FXA FITNESS · HISTORY</p>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">Daily Work History</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Work check-ins, assigned tasks, and employee completion reports. Staff only see their own records; Admin and Manager can review all permitted records.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase text-yellow-300">{roleLabel(role)}</span>
                <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase text-cyan-300">{filterLabel}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {role === "admin" ? (
                <Link href="/admin/work-tasks" className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black">Manage Work</Link>
              ) : isManagement ? null : (
                <Link href="/work" className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black">Daily Work</Link>
              )}
              <Link
                href={isManagement ? "/admin" : role === "marketing_manager" ? "/admin/marketing" : "/trainer/scan"}
                className="rounded-xl border border-white/15 px-4 py-3 text-xs font-black uppercase text-zinc-300"
              >
                Back
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Check-ins</p>
              <p className="mt-2 text-3xl font-black text-emerald-300">{checkins.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Reports</p>
              <p className="mt-2 text-3xl font-black text-yellow-400">{reports.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Reviewed</p>
              <p className="mt-2 text-3xl font-black text-cyan-300">{reviewedReportCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Tasks Done</p>
              <p className="mt-2 text-3xl font-black text-violet-300">{completedTaskCount}</p>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-3xl border border-white/10 bg-[#0d0d0d] p-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={applyToday} className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-black text-black">Today</button>
            <button onClick={applyWeek} className="rounded-xl border border-yellow-400/40 px-4 py-2 text-xs font-black text-yellow-300">This Week</button>
            <button onClick={applyMonth} className="rounded-xl border border-yellow-400/40 px-4 py-2 text-xs font-black text-yellow-300">This Month</button>
            <button onClick={applyAll} className="rounded-xl border border-white/15 px-4 py-2 text-xs font-black text-zinc-300">All Time</button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[160px_160px_1fr_auto]">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="min-h-12 rounded-xl border border-white/15 bg-black px-3 text-sm outline-none focus:border-yellow-400" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="min-h-12 rounded-xl border border-white/15 bg-black px-3 text-sm outline-none focus:border-yellow-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search employee, task, report, blocker..." className="min-h-12 rounded-xl border border-white/15 bg-black px-4 text-base outline-none placeholder:text-zinc-700 focus:border-yellow-400" />
            <button onClick={applyCustom} className="min-h-12 rounded-xl bg-yellow-400 px-5 text-sm font-black uppercase text-black">Apply</button>
          </div>
        </section>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{errorMessage}</div>
        ) : null}

        <nav className="mt-4 grid grid-cols-3 gap-2">
          {([
            ["reports", `Reports (${filteredReports.length})`],
            ["checkins", `Check-ins (${filteredCheckins.length})`],
            ["tasks", `Tasks (${filteredTasks.length})`],
          ] as Array<[WorkView, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`min-h-12 rounded-xl border px-2 text-xs font-black md:text-sm ${view === id ? "border-yellow-400 bg-yellow-400 text-black" : "border-white/10 bg-[#0d0d0d] text-zinc-400"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-[#0d0d0d] p-10 text-center text-yellow-400">Loading...</div>
        ) : null}

        {!loading && view === "reports" ? (
          <section className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredReports.map((report) => {
              const person = profileMap.get(report.staff_id);
              const task = report.task_id ? taskMap.get(report.task_id) : null;
              return (
                <article key={report.id} className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-[9px] font-black uppercase text-yellow-300">{report.report_type === "task_completion" ? "Task Report" : "Daily Report"}</span>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusClass(report.status)}`}>{report.status}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-black">{report.title}</h3>
                      <p className="mt-1 text-sm font-bold text-yellow-300">{person?.full_name || person?.email || "Staff"}</p>
                      <p className="mt-1 text-xs text-zinc-600">{formatDate(report.work_date)} · {roleLabel(person?.role || null)}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-600">{formatDateTime(report.created_at)}</span>
                  </div>

                  {task ? <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3 text-xs text-violet-200">Task: {task.title}</div> : null}

                  <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                    <p className="whitespace-pre-wrap">{report.summary}</p>
                    {report.completed_items ? (
                      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
                        <p className="text-[10px] font-black uppercase text-emerald-300">Completed Items</p>
                        <p className="mt-1 whitespace-pre-wrap">{report.completed_items}</p>
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
                        <p className="text-[10px] font-black uppercase text-cyan-300">Next Steps</p>
                        <p className="mt-1 whitespace-pre-wrap">{report.next_steps}</p>
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
            {filteredReports.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500 lg:col-span-2">No work reports found.</div> : null}
          </section>
        ) : null}

        {!loading && view === "checkins" ? (
          <section className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-yellow-400 text-black">
                  <tr>
                    <th className="px-4 py-3 text-xs font-black uppercase">Work Date</th>
                    <th className="px-4 py-3 text-xs font-black uppercase">Employee</th>
                    <th className="px-4 py-3 text-xs font-black uppercase">Role</th>
                    <th className="px-4 py-3 text-xs font-black uppercase">Time</th>
                    <th className="px-4 py-3 text-xs font-black uppercase">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckins.map((row, index) => {
                    const person = profileMap.get(row.staff_id);
                    return (
                      <tr key={row.id} className={`border-b border-white/10 ${index % 2 === 0 ? "bg-[#0d0d0d]" : "bg-[#121212]"}`}>
                        <td className="px-4 py-4 font-bold text-yellow-300">{formatDate(row.work_date)}</td>
                        <td className="px-4 py-4">{person?.full_name || person?.email || "Staff"}</td>
                        <td className="px-4 py-4 text-zinc-400">{roleLabel(person?.role || null)}</td>
                        <td className="px-4 py-4 text-zinc-300">{formatDateTime(row.checkin_at)}</td>
                        <td className="px-4 py-4"><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-300">QR</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredCheckins.length === 0 ? <div className="p-8 text-center text-sm text-zinc-500">No work check-ins found.</div> : null}
          </section>
        ) : null}

        {!loading && view === "tasks" ? (
          <section className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredTasks.map((task) => {
              const person = profileMap.get(task.assigned_to);
              return (
                <article key={task.id} className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${priorityClass(task.priority)}`}>{task.priority}</span>
                    <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusClass(task.status)}`}>{task.status.replaceAll("_", " ")}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-black">{task.title}</h3>
                  <p className="mt-1 text-sm font-bold text-yellow-300">{person?.full_name || person?.email || "Staff"}</p>
                  <p className="mt-1 text-xs text-zinc-600">{roleLabel(person?.role || null)} · {formatDate(task.task_date)}</p>
                  {task.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                    <span>Due: {formatDateTime(task.due_at)}</span>
                    {task.completed_at ? <span>Completed: {formatDateTime(task.completed_at)}</span> : null}
                  </div>
                </article>
              );
            })}
            {filteredTasks.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500 lg:col-span-2">No work tasks found.</div> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
