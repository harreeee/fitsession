"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "../../lib/supabaseClient";
import { getCurrentUserRole } from "../../lib/checkUserRole";

type WorkRole = "trainer" | "nutrition_coach" | "marketing_manager";
type MobileTab = "today" | "scan" | "report" | "history";
type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type Priority = "low" | "normal" | "high" | "urgent";

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
  created_at: string;
};

type WorkCheckin = {
  id: string;
  staff_id: string;
  code_id: string;
  work_date: string;
  method: "qr";
  checkin_at: string;
};

type CheckinRpcRow = {
  checkin_id: string;
  work_date: string;
  checkin_at: string;
  code_label: string;
  already_checked_in: boolean;
};

type ReportRpcRow = {
  report_id: string;
  report_type: string;
  work_date: string;
  task_status: string | null;
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

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return String((error as { message: string }).message);
  }
  return "Unknown error";
}

function roleLabel(role: string | null) {
  if (role === "trainer") return "Trainer";
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "marketing_manager") return "Marketing";
  return "Staff";
}

function priorityLabel(priority: Priority) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Normal";
}

function priorityClass(priority: Priority) {
  if (priority === "urgent") return "border-red-400/40 bg-red-400/10 text-red-300";
  if (priority === "high") return "border-orange-400/40 bg-orange-400/10 text-orange-300";
  if (priority === "low") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

function statusClass(status: TaskStatus | string) {
  if (status === "completed") return "border-emerald-400/35 bg-emerald-400/10 text-emerald-300";
  if (status === "in_progress") return "border-cyan-400/35 bg-cyan-400/10 text-cyan-300";
  if (status === "cancelled") return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

async function waitForElement(id: string, timeoutMs = 2000) {
  if (typeof document === "undefined") throw new Error("Camera is only available in the browser.");
  const existing = document.getElementById(id);
  if (existing) return existing;

  return new Promise<HTMLElement>((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const element = document.getElementById(id);
      if (element) {
        resolve(element);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Scanner container #${id} was not mounted in time.`));
        return;
      }
      window.requestAnimationFrame(check);
    };
    window.requestAnimationFrame(check);
  });
}

export default function DailyWorkPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanLockRef = useRef(false);

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<WorkRole | null>(null);
  const [staffName, setStaffName] = useState("Staff");
  const [activeTab, setActiveTab] = useState<MobileTab>("today");

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [checkins, setCheckins] = useState<WorkCheckin[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const [scannerStarted, setScannerStarted] = useState(false);
  const [cameraOpening, setCameraOpening] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [reportTitle, setReportTitle] = useState("Daily Work Report");
  const [summary, setSummary] = useState("");
  const [completedItems, setCompletedItems] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState("");

  const today = todayValue();

  const todayCheckin = useMemo(
    () => checkins.find((row) => row.work_date === today) || null,
    [checkins, today],
  );

  const todayDailyReport = useMemo(
    () =>
      reports.find(
        (row) => row.work_date === today && row.report_type === "daily" && !row.task_id,
      ) || null,
    [reports, today],
  );

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" || task.status === "in_progress"),
    [tasks],
  );

  const completedToday = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === "completed" &&
          task.completed_at &&
          new Date(task.completed_at).toLocaleDateString("en-CA") ===
            new Date().toLocaleDateString("en-CA"),
      ).length,
    [tasks],
  );

  async function loadData(id: string) {
    setLoading(true);

    const [taskResult, reportResult, checkinResult] = await Promise.all([
      supabase
        .from("staff_tasks")
        .select(
          "id, title, description, assigned_to, assigned_by, task_date, due_at, priority, status, report_required, completed_at, created_at",
        )
        .eq("assigned_to", id)
        .order("task_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("staff_work_reports")
        .select(
          "id, staff_id, task_id, work_date, report_type, title, summary, completed_items, blockers, next_steps, status, admin_comment, created_at",
        )
        .eq("staff_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("staff_work_checkins")
        .select("id, staff_id, code_id, work_date, method, checkin_at")
        .eq("staff_id", id)
        .order("checkin_at", { ascending: false })
        .limit(40),
    ]);

    if (taskResult.error) {
      setMessageType("error");
      setMessage(`Could not load assigned tasks: ${taskResult.error.message}`);
    } else {
      setTasks((taskResult.data || []) as WorkTask[]);
    }

    if (reportResult.error) {
      setMessageType("error");
      setMessage(`Could not load work reports: ${reportResult.error.message}`);
    } else {
      setReports((reportResult.data || []) as WorkReport[]);
    }

    if (checkinResult.error) {
      setMessageType("error");
      setMessage(`Could not load work check-ins: ${checkinResult.error.message}`);
    } else {
      setCheckins((checkinResult.data || []) as WorkCheckin[]);
    }

    setLoading(false);
  }

  async function stopScanner() {
    const scanner = scannerRef.current;
    try {
      if (scanner?.isScanning) await scanner.stop();
      if (scanner) await scanner.clear();
    } catch (error) {
      console.log("Work scanner stop error:", error);
    } finally {
      scannerRef.current = null;
      scanLockRef.current = false;
      setCameraOpening(false);
      setScannerStarted(false);
    }
  }

  async function openTab(tab: MobileTab) {
    if (tab !== "scan" && scannerStarted) await stopScanner();
    setActiveTab(tab);
    setMessage("");
    setMessageType("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cameraEnvironmentError() {
    if (typeof window === "undefined") return null;
    if (!window.isSecureContext) {
      return `Camera is blocked because ${window.location.origin} is not a secure HTTPS context.`;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return "This browser does not expose the camera API. Try Safari or Chrome with camera permission enabled.";
    }
    return null;
  }

  function cameraErrorMessage(error: unknown) {
    const environmentError = cameraEnvironmentError();
    if (environmentError) return environmentError;
    const raw = getErrorMessage(error);
    const lower = raw.toLowerCase();

    if (lower.includes("notallowed") || lower.includes("permission") || lower.includes("denied")) {
      return "Camera permission was denied. Allow camera access for this site, then try again.";
    }
    if (lower.includes("notfound") || lower.includes("no camera")) {
      return "No available camera was found on this device.";
    }
    if (lower.includes("notreadable") || lower.includes("in use")) {
      return "The camera could not be opened. Close other apps using the camera, then try again.";
    }
    return `Camera could not start: ${raw}`;
  }

  async function recordCheckin(decodedText: string) {
    const token = decodedText.trim();
    const { data, error } = await supabase.rpc("record_staff_work_checkin", {
      p_qr_token: token,
    });

    if (error) throw error;

    const raw = Array.isArray(data) ? data[0] : data;
    const row = raw as CheckinRpcRow | null;
    if (!row?.checkin_id) throw new Error("Check-in did not return a valid record ID.");

    setMessageType("success");
    setMessage(
      row.already_checked_in
        ? `You already checked in today at ${formatDateTime(row.checkin_at)}.`
        : `Work check-in complete at ${formatDateTime(row.checkin_at)}.` ,
    );
    await loadData(userId);
  }

  async function startScanner() {
    setMessage("");
    setMessageType("");

    const environmentError = cameraEnvironmentError();
    if (environmentError) {
      setMessageType("error");
      setMessage(environmentError);
      return;
    }

    if (scannerStarted || scannerRef.current) return;

    try {
      scanLockRef.current = false;
      setCameraOpening(true);
      setScannerStarted(true);
      await waitForElement("work-qr-reader");

      const scanner = new Html5Qrcode("work-qr-reader");
      scannerRef.current = scanner;

      const size = Math.min(300, Math.max(220, Math.floor(window.innerWidth * 0.72)));
      const config = { fps: 10, qrbox: { width: size, height: size } };

      const onSuccess = async (decodedText: string) => {
        if (scanLockRef.current) return;
        scanLockRef.current = true;
        try {
          await stopScanner();
          await recordCheckin(decodedText);
        } catch (error) {
          setMessageType("error");
          setMessage(getErrorMessage(error));
        }
      };

      try {
        await scanner.start(
          { facingMode: "environment" },
          config,
          onSuccess,
          () => {},
        );
        setCameraOpening(false);
      } catch (firstError) {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw firstError;
        const preferred =
          cameras.find((camera) => /(back|rear|environment)/i.test(camera.label || "")) ||
          cameras[cameras.length - 1];
        await scanner.start(preferred.id, config, onSuccess, () => {});
        setCameraOpening(false);
      }
    } catch (error) {
      console.error("Work check-in camera error:", error);
      await stopScanner();
      setMessageType("error");
      setMessage(cameraErrorMessage(error));
    }
  }

  async function startTask(taskId: string) {
    setStartingTaskId(taskId);
    setMessage("");
    setMessageType("");

    const { error } = await supabase.rpc("start_staff_task", {
      p_task_id: taskId,
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
    } else {
      setMessageType("success");
      setMessage("Task started. You can submit the completion report when finished.");
      await loadData(userId);
    }

    setStartingTaskId("");
  }

  function openTaskReport(task: WorkTask) {
    setSelectedTaskId(task.id);
    setReportTitle(task.title);
    setSummary("");
    setCompletedItems("");
    setBlockers("");
    setNextSteps("");
    setMessage("");
    setMessageType("");
    setActiveTab("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetReportForm() {
    setSelectedTaskId("");
    setReportTitle("Daily Work Report");
    setSummary("");
    setCompletedItems("");
    setBlockers("");
    setNextSteps("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary.trim()) {
      setMessageType("error");
      setMessage("Report summary is required.");
      return;
    }

    setSubmittingReport(true);
    setMessage("");
    setMessageType("");

    const { data, error } = await supabase.rpc("submit_staff_work_report", {
      p_task_id: selectedTaskId || null,
      p_title: reportTitle.trim(),
      p_summary: summary.trim(),
      p_completed_items: completedItems.trim(),
      p_blockers: blockers.trim(),
      p_next_steps: nextSteps.trim(),
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      setSubmittingReport(false);
      return;
    }

    const raw = Array.isArray(data) ? data[0] : data;
    const row = raw as ReportRpcRow | null;

    setMessageType("success");
    setMessage(
      row?.report_type === "task_completion"
        ? "Task completion report submitted. The assigned task is now completed."
        : "Daily work report submitted successfully.",
    );
    resetReportForm();
    await loadData(userId);
    setSubmittingReport(false);
  }

  useEffect(() => {
    let alive = true;

    async function protect() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!alive) return;

      if (!user) {
        router.push("/login");
        return;
      }

      if (currentRole === "admin") {
        router.push("/admin/work-tasks");
        return;
      }

      if (currentRole === "manager") {
        router.push("/history/work");
        return;
      }

      if (
        currentRole !== "trainer" &&
        currentRole !== "nutrition_coach" &&
        currentRole !== "marketing_manager"
      ) {
        router.push(currentRole === "client" ? "/client" : "/login");
        return;
      }

      setUserId(user.id);
      setRole(currentRole);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      setStaffName(profile?.full_name || user.email || "Staff");
      setCheckingRole(false);
      await loadData(user.id);
    }

    void protect();

    return () => {
      alive = false;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!selectedTaskId) {
      setReportTitle("Daily Work Report");
      return;
    }
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (task) setReportTitle(task.title);
  }, [selectedTaskId, tasks]);

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
        <div className="text-center">
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-white/10 border-t-yellow-400" />
          <p className="mt-4 text-sm font-bold text-yellow-400">Loading Daily Work...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black pb-24 text-white md:pb-8">
      <style jsx global>{`
        html,
        body {
          background: #000;
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
        #work-qr-reader {
          border: 0 !important;
        }
        #work-qr-reader video {
          border-radius: 22px !important;
          object-fit: cover !important;
        }
        #work-qr-reader img {
          display: none !important;
        }
        #work-qr-reader__scan_region,
        #work-qr-reader__dashboard {
          background: #080808 !important;
          color: #fff !important;
          border: 0 !important;
        }
      `}</style>

      <div className="mx-auto max-w-xl px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))] md:max-w-4xl md:px-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-400">
              FXA FITNESS · DAILY WORK
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">{staffName}</h1>
            <p className="mt-1 text-xs text-zinc-500">{roleLabel(role)} · {formatDate(today)}</p>
          </div>
          <Link
            href="/history/work"
            className="flex h-11 items-center rounded-xl border border-white/10 bg-[#111] px-3 text-xs font-black text-zinc-300"
          >
            History
          </Link>
        </header>

        {message ? (
          <div
            className={`mb-5 rounded-2xl border p-4 text-sm leading-6 ${
              messageType === "success"
                ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/35 bg-red-400/10 text-red-200"
            }`}
          >
            {message}
          </div>
        ) : null}

        {activeTab === "today" ? (
          <section>
            <div className="rounded-3xl border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.14),_transparent_45%),#0d0d0d] p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-yellow-400">Today</p>
              <h2 className="mt-2 text-3xl font-black">Daily Work Check-in</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Check in once, complete assigned tasks, then submit your daily or task report.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/10 bg-black/45 p-3 text-center">
                  <p className={`text-2xl font-black ${todayCheckin ? "text-emerald-300" : "text-zinc-600"}`}>
                    {todayCheckin ? "✓" : "—"}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-zinc-400">Check-in</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/45 p-3 text-center">
                  <p className="text-2xl font-black text-yellow-400">{openTasks.length}</p>
                  <p className="mt-1 text-[10px] font-bold text-zinc-400">Open Tasks</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/45 p-3 text-center">
                  <p className="text-2xl font-black text-cyan-300">{completedToday}</p>
                  <p className="mt-1 text-[10px] font-bold text-zinc-400">Done Today</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openTab("scan")}
                  className="min-h-14 rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-black active:scale-[0.99]"
                >
                  {todayCheckin ? "View Check-in" : "Scan Check-in QR"}
                </button>
                <button
                  type="button"
                  onClick={() => openTab("report")}
                  className="min-h-14 rounded-2xl border border-yellow-400/45 bg-yellow-400/[0.06] px-4 py-3 text-sm font-black uppercase tracking-wide text-yellow-300 active:scale-[0.99]"
                >
                  {todayDailyReport ? "Task Report" : "Daily Report"}
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">My Tasks</p>
                <h2 className="mt-1 text-xl font-black">Assigned Work</h2>
              </div>
              {loading ? <span className="text-xs text-zinc-600">Loading...</span> : null}
            </div>

            <div className="mt-3 space-y-3">
              {openTasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 bg-[#0d0d0d] p-7 text-center">
                  <p className="text-3xl">✓</p>
                  <p className="mt-3 text-sm font-bold">No open assigned tasks</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    You can still submit your daily work report.
                  </p>
                </div>
              ) : (
                openTasks.map((task) => (
                  <article key={task.id} className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${priorityClass(task.priority)}`}>
                            {priorityLabel(task.priority)}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusClass(task.status)}`}>
                            {task.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-black text-white">{task.title}</h3>
                        {task.description ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{task.description}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                          <span>Task date: {formatDate(task.task_date)}</span>
                          {task.due_at ? <span>Due: {formatDateTime(task.due_at)}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {task.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => startTask(task.id)}
                          disabled={startingTaskId === task.id}
                          className="min-h-12 rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 text-xs font-black uppercase text-cyan-300 disabled:opacity-50"
                        >
                          {startingTaskId === task.id ? "Starting..." : "Start Task"}
                        </button>
                      ) : (
                        <div className="flex min-h-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-3 text-xs font-black uppercase text-cyan-300">
                          In Progress
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openTaskReport(task)}
                        className="min-h-12 rounded-xl bg-yellow-400 px-3 text-xs font-black uppercase text-black"
                      >
                        Complete & Report
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "scan" ? (
          <section>
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.06] text-4xl text-yellow-400">
                ⌗
              </div>
              <h2 className="mt-5 text-2xl font-black">Daily QR Check-in</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">
                Scan the current FXA staff work QR code. Only one work check-in is recorded per day.
              </p>
            </div>

            {todayCheckin && !scannerStarted ? (
              <div className="mt-6 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
                <div className="text-4xl text-emerald-300">✓</div>
                <p className="mt-3 text-lg font-black text-emerald-200">Checked in today</p>
                <p className="mt-1 text-sm text-emerald-100/70">{formatDateTime(todayCheckin.checkin_at)}</p>
              </div>
            ) : null}

            {!scannerStarted ? (
              <button
                type="button"
                onClick={startScanner}
                className="mt-6 min-h-14 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-black uppercase tracking-wide text-black active:scale-[0.99]"
              >
                {todayCheckin ? "Scan Again" : "Open Camera"}
              </button>
            ) : (
              <div className="mt-6">
                <div className="relative rounded-[28px] border border-yellow-400/30 bg-[#080808] p-2">
                  <span className="absolute left-0 top-0 z-20 h-8 w-8 rounded-tl-[24px] border-l-4 border-t-4 border-yellow-400" />
                  <span className="absolute right-0 top-0 z-20 h-8 w-8 rounded-tr-[24px] border-r-4 border-t-4 border-yellow-400" />
                  <span className="absolute bottom-0 left-0 z-20 h-8 w-8 rounded-bl-[24px] border-b-4 border-l-4 border-yellow-400" />
                  <span className="absolute bottom-0 right-0 z-20 h-8 w-8 rounded-br-[24px] border-b-4 border-r-4 border-yellow-400" />
                  <div id="work-qr-reader" className="min-h-[360px] overflow-hidden rounded-[22px] bg-[#080808]" />
                  {cameraOpening ? (
                    <div className="absolute inset-2 z-10 flex min-h-[360px] items-center justify-center rounded-[22px] bg-black/85">
                      <div className="text-center">
                        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-yellow-400/20 border-t-yellow-400" />
                        <p className="mt-4 text-sm font-bold">Opening camera...</p>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={stopScanner}
                  className="mt-4 min-h-12 w-full rounded-xl border border-yellow-400/50 text-sm font-black text-yellow-400"
                >
                  Stop Scanner
                </button>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "report" ? (
          <section>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">Work Report</p>
              <h2 className="mt-1 text-2xl font-black">Submit Completion Report</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Choose an assigned task to complete it, or leave Task as Daily Report for your general end-of-day update.
              </p>
            </div>

            <form onSubmit={submitReport} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">Report For</label>
                <select
                  value={selectedTaskId}
                  onChange={(event) => setSelectedTaskId(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-white/15 bg-[#0d0d0d] px-4 py-3 text-base text-white outline-none focus:border-yellow-400"
                >
                  <option value="">Daily Report — no assigned task</option>
                  {openTasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">Title</label>
                <input
                  value={reportTitle}
                  onChange={(event) => setReportTitle(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-white/15 bg-[#0d0d0d] px-4 py-3 text-base text-white outline-none focus:border-yellow-400"
                  placeholder="Daily Work Report"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-yellow-400">Summary *</label>
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="min-h-32 w-full rounded-2xl border border-white/15 bg-[#0d0d0d] px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-yellow-400"
                  placeholder="What was completed today? What result did you achieve?"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">Completed Items</label>
                <textarea
                  value={completedItems}
                  onChange={(event) => setCompletedItems(event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-white/15 bg-[#0d0d0d] px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-yellow-400"
                  placeholder="Example: contacted 8 leads, posted 2 reels, completed client follow-ups..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">Blockers / Problems</label>
                  <textarea
                    value={blockers}
                    onChange={(event) => setBlockers(event.target.value)}
                    className="min-h-24 w-full rounded-2xl border border-white/15 bg-[#0d0d0d] px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-yellow-400"
                    placeholder="Anything blocking progress?"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">Next Steps</label>
                  <textarea
                    value={nextSteps}
                    onChange={(event) => setNextSteps(event.target.value)}
                    className="min-h-24 w-full rounded-2xl border border-white/15 bg-[#0d0d0d] px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-yellow-400"
                    placeholder="What should happen next?"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  submittingReport ||
                  !summary.trim() ||
                  (!selectedTaskId && Boolean(todayDailyReport))
                }
                className="min-h-14 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-black uppercase tracking-wide text-black disabled:opacity-40"
              >
                {submittingReport
                  ? "Submitting..."
                  : selectedTaskId
                    ? "Complete Task & Submit"
                    : todayDailyReport
                      ? "Daily Report Already Submitted"
                      : "Submit Daily Report"}
              </button>

              {!selectedTaskId && todayDailyReport ? (
                <p className="text-center text-xs leading-5 text-zinc-500">
                  You already submitted today&apos;s general daily report. Select an assigned task above to submit a task completion report.
                </p>
              ) : null}
            </form>
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-400">Recent Activity</p>
                <h2 className="mt-1 text-2xl font-black">My Work History</h2>
              </div>
              <Link href="/history/work" className="rounded-xl border border-yellow-400/40 px-3 py-2 text-xs font-black text-yellow-400">
                View All
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {reports.slice(0, 8).map((report) => (
                <article key={report.id} className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-[9px] font-black uppercase text-yellow-300">
                          {report.report_type === "task_completion" ? "Task Report" : "Daily Report"}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${report.status === "reviewed" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"}`}>
                          {report.status}
                        </span>
                      </div>
                      <h3 className="mt-3 font-black">{report.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{report.summary}</p>
                      {report.admin_comment ? (
                        <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3 text-xs leading-5 text-cyan-100">
                          Admin: {report.admin_comment}
                        </div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-600">{formatDate(report.work_date)}</span>
                  </div>
                </article>
              ))}

              {reports.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 p-7 text-center text-sm text-zinc-500">
                  No work reports yet.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {([
            ["today", "⌂", "Today"],
            ["scan", "⌗", "Check In"],
            ["report", "▤", "Report"],
            ["history", "◷", "History"],
          ] as Array<[MobileTab, string, string]>).map(([tab, icon, label]) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => openTab(tab)}
                className={`min-h-[58px] rounded-xl px-1 py-1.5 text-center transition active:scale-[0.97] ${active ? "bg-yellow-400/10 text-yellow-400" : "text-zinc-500"}`}
              >
                <div className="text-xl leading-none">{icon}</div>
                <div className="mt-1.5 text-[10px] font-black">{label}</div>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
