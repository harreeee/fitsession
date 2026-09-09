"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { staffFetch } from "@/lib/staffFetch";
import {
  FOLLOW_METHOD_LABELS,
  FOLLOW_OUTCOME_LABELS,
  FOLLOW_REASON_OPTIONS,
  FOLLOW_REQUIREMENT_LABELS,
  PRIORITY_LABELS,
  WORKFLOW_STATUS_LABELS,
  type FollowRequirement,
  type NutritionFollowMethod,
  type NutritionFollowOutcome,
  type NutritionPriority,
  type NutritionWorkflowStatus,
} from "@/lib/nutrition";

type ClientRow = {
  id: string;
  profile_id: string | null;
  client_code: string | null;
  full_name: string;
  status: string | null;
  assigned_trainer_id: string | null;
  assigned_nutrition_coach_id: string | null;
};

type StatusRow = {
  client_id: string;
  follow_requirement: FollowRequirement;
  follow_reason: string | null;
  workflow_status: NutritionWorkflowStatus;
  priority: NutritionPriority | null;
  nutrition_coach_id: string | null;
  next_follow_at: string | null;
  admin_note: string | null;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type FollowLog = {
  id: string;
  client_id: string;
  nutrition_coach_id: string;
  follow_date: string;
  method: NutritionFollowMethod;
  client_responded: boolean | null;
  nutrition_summary: string | null;
  body_comp: string | null;
  activity: string | null;
  current_issue: string | null;
  action_taken: string | null;
  follow_result: string | null;
  next_action: string | null;
  next_follow_at: string | null;
  outcome: NutritionFollowOutcome;
  result_4r: boolean;
  result_4r_detail: string | null;
  review_4r: boolean;
  review_4r_detail: string | null;
  refer_4r: boolean;
  refer_4r_detail: string | null;
  renew_4r: boolean;
  renew_4r_detail: string | null;
  created_at: string;
  updated_at: string | null;
};

type NutritionSession = {
  id: string;
  client_id: string;
  trainer_id: string | null;
  session_type: string | null;
  status: string | null;
  message: string | null;
  session_topic: string | null;
  session_content: string | null;
  trainer_note: string | null;
  photo_path: string | null;
  created_at: string | null;
};

type NutritionPayload = {
  viewer: { id: string; role: string; fullName: string };
  permissions: {
    canManageAssignments: boolean;
    canEditRequirement: boolean;
    canRecordFollow: boolean;
  };
  clients: ClientRow[];
  statuses: StatusRow[];
  profiles: ProfileRow[];
  logs: FollowLog[];
  nutritionSessions: NutritionSession[];
};

type ViewKey = "action" | "all" | "followed" | "no_follow";
type FourRKey = "renew" | "refer" | "result" | "review";

type FourRConfig = {
  key: FourRKey;
  label: "Renew" | "Refer" | "Result" | "Review";
  flag: "renew_4r" | "refer_4r" | "result_4r" | "review_4r";
  detail: "renew_4r_detail" | "refer_4r_detail" | "result_4r_detail" | "review_4r_detail";
  formFlag: "renew4r" | "refer4r" | "result4r" | "review4r";
  formDetail: "renew4rDetail" | "refer4rDetail" | "result4rDetail" | "review4rDetail";
  help: string;
  color: string;
};

const FOUR_R: FourRConfig[] = [
  {
    key: "renew",
    label: "Renew",
    flag: "renew_4r",
    detail: "renew_4r_detail",
    formFlag: "renew4r",
    formDetail: "renew4rDetail",
    help: "Khách đã gia hạn hoặc xác nhận renewal. Ghi rõ package/số buổi hoặc nội dung xác nhận.",
    color: "text-emerald-300",
  },
  {
    key: "refer",
    label: "Refer",
    flag: "refer_4r",
    detail: "refer_4r_detail",
    formFlag: "refer4r",
    formDetail: "refer4rDetail",
    help: "Khách đã giới thiệu lead/khách mới. Ghi rõ tên hoặc thông tin referral.",
    color: "text-sky-300",
  },
  {
    key: "result",
    label: "Result",
    flag: "result_4r",
    detail: "result_4r_detail",
    formFlag: "result4r",
    formDetail: "result4rDetail",
    help: "Có kết quả thực tế. Ghi rõ cân nặng, số đo, body comp, thói quen hoặc progress đạt được.",
    color: "text-yellow-300",
  },
  {
    key: "review",
    label: "Review",
    flag: "review_4r",
    detail: "review_4r_detail",
    formFlag: "review4r",
    formDetail: "review4rDetail",
    help: "Đã nhận review/testimonial. Ghi rõ nền tảng hoặc nội dung review đã nhận.",
    color: "text-violet-300",
  },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
}

function torontoMonth(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return year && month ? `${year}-${month}` : "";
}

function formatMonthLabel(month: string) {
  const date = new Date(`${month}-15T12:00:00Z`);
  return date.toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "America/Toronto" });
}

function isOverdue(value: string | null | undefined, status: NutritionWorkflowStatus) {
  if (!value || status === "followed") return false;
  const due = new Date(`${value.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isFinite(due) && due < today.getTime();
}

function requirementClass(value: FollowRequirement) {
  if (value === "need_follow") return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  if (value === "no_follow") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (value === "monitor") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (value === "paused") return "border-zinc-400/25 bg-zinc-400/10 text-zinc-300";
  return "border-sky-400/30 bg-sky-400/10 text-sky-300";
}

function statusClass(value: NutritionWorkflowStatus) {
  if (value === "followed") return "text-emerald-300";
  if (value === "escalate") return "text-rose-300";
  if (value === "in_progress") return "text-sky-300";
  if (value === "waiting_client" || value === "waiting_pt") return "text-violet-300";
  if (value === "follow_again") return "text-orange-300";
  return "text-zinc-300";
}

function fourRFlags(logs: FollowLog[], month: string) {
  const current = logs.filter((log) => torontoMonth(log.follow_date) === month);
  return {
    renew: current.some((log) => log.renew_4r),
    refer: current.some((log) => log.refer_4r),
    result: current.some((log) => log.result_4r),
    review: current.some((log) => log.review_4r),
  };
}

export default function NutritionPage() {
  const router = useRouter();
  const [data, setData] = useState<NutritionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewKey>("action");
  const [coachFilter, setCoachFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showFollowForm, setShowFollowForm] = useState(false);
  const [editing4RLogId, setEditing4RLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fourRMonth = torontoMonth(new Date());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await staffFetch<NutritionPayload>("/api/nutrition");
      setData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load Nutrition.";
      setError(message);
      if (/sign in/i.test(message)) router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const profilesById = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    data?.profiles.forEach((profile) => map.set(profile.id, profile));
    return map;
  }, [data]);

  const statusesByClient = useMemo(() => {
    const map = new Map<string, StatusRow>();
    data?.statuses.forEach((row) => map.set(row.client_id, row));
    return map;
  }, [data]);

  const logsByClient = useMemo(() => {
    const map = new Map<string, FollowLog[]>();
    data?.logs.forEach((log) => {
      const rows = map.get(log.client_id) || [];
      rows.push(log);
      map.set(log.client_id, rows);
    });
    return map;
  }, [data]);

  const sessionsByClient = useMemo(() => {
    const map = new Map<string, NutritionSession[]>();
    data?.nutritionSessions.forEach((session) => {
      const rows = map.get(session.client_id) || [];
      rows.push(session);
      map.set(session.client_id, rows);
    });
    return map;
  }, [data]);

  const nutritionCoaches = useMemo(
    () => data?.profiles.filter((profile) => profile.role === "nutrition_coach") || [],
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.clients
      .map((client) => {
        const saved = statusesByClient.get(client.id);
        const logs = logsByClient.get(client.id) || [];
        const sessions = sessionsByClient.get(client.id) || [];
        const requirement = saved?.follow_requirement || "unreviewed";
        const workflowStatus = saved?.workflow_status || "not_started";
        const priority = saved?.priority || null;
        const coachId = saved?.nutrition_coach_id || client.assigned_nutrition_coach_id || null;
        const coach = coachId ? profilesById.get(coachId) : null;
        const trainer = client.assigned_trainer_id ? profilesById.get(client.assigned_trainer_id) : null;
        return {
          client,
          saved,
          logs,
          sessions,
          requirement,
          workflowStatus,
          priority,
          coachId,
          coachName: coach?.full_name || coach?.email || "Chưa phân công",
          trainerName: trainer?.full_name || trainer?.email || "—",
          latestLog: logs[0] || null,
          latestScan: sessions[0] || null,
          overdue: isOverdue(saved?.next_follow_at, workflowStatus),
          fourR: fourRFlags(logs, fourRMonth),
        };
      })
      .filter((row) => {
        if (q) {
          const text = `${row.client.client_code || ""} ${row.client.full_name} ${row.coachName} ${row.trainerName}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        if (coachFilter !== "all" && (row.coachId || "unassigned") !== coachFilter) return false;
        if (statusFilter !== "all" && row.workflowStatus !== statusFilter) return false;
        if (requirementFilter !== "all" && row.requirement !== requirementFilter) return false;
        if (priorityFilter !== "all" && (row.priority || "none") !== priorityFilter) return false;
        if (view === "action") return row.requirement === "need_follow" && row.workflowStatus !== "followed";
        if (view === "followed") return row.workflowStatus === "followed";
        if (view === "no_follow") return row.requirement === "no_follow";
        return true;
      })
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        const rank = { p1: 0, p2: 1, p3: 2, none: 3 } as const;
        const aRank = rank[(a.priority || "none") as keyof typeof rank];
        const bRank = rank[(b.priority || "none") as keyof typeof rank];
        if (aRank !== bRank) return aRank - bRank;
        return a.client.full_name.localeCompare(b.client.full_name);
      });
  }, [data, search, coachFilter, statusFilter, requirementFilter, priorityFilter, view, statusesByClient, logsByClient, sessionsByClient, profilesById, fourRMonth]);

  const summary = useMemo(() => {
    if (!data) return { need: 0, overdue: 0, progress: 0, waiting: 0, followed: 0, unreviewed: 0 };
    return data.clients.reduce(
      (acc, client) => {
        const status = statusesByClient.get(client.id);
        const requirement = status?.follow_requirement || "unreviewed";
        const workflow = status?.workflow_status || "not_started";
        if (requirement === "need_follow") acc.need += 1;
        if (requirement === "unreviewed") acc.unreviewed += 1;
        if (workflow === "in_progress") acc.progress += 1;
        if (workflow === "waiting_client" || workflow === "waiting_pt") acc.waiting += 1;
        if (workflow === "followed") acc.followed += 1;
        if (requirement === "need_follow" && isOverdue(status?.next_follow_at, workflow)) acc.overdue += 1;
        return acc;
      },
      { need: 0, overdue: 0, progress: 0, waiting: 0, followed: 0, unreviewed: 0 },
    );
  }, [data, statusesByClient]);

  const fourRMetrics = useMemo(() => {
    if (!data) return { renew: 0, refer: 0, result: 0, review: 0, reports: 0, clients: 0, label: "Nutrition Team" };
    let scoped = data.logs.filter((log) => torontoMonth(log.follow_date) === fourRMonth);
    let label = "Nutrition Team";
    if (data.viewer.role === "nutrition_coach") {
      scoped = scoped.filter((log) => log.nutrition_coach_id === data.viewer.id);
      label = data.viewer.fullName;
    } else if (coachFilter === "unassigned") {
      scoped = [];
      label = "Unassigned";
    } else if (coachFilter !== "all") {
      scoped = scoped.filter((log) => log.nutrition_coach_id === coachFilter);
      const coach = profilesById.get(coachFilter);
      label = coach?.full_name || coach?.email || "Selected Coach";
    }
    const sets = { renew: new Set<string>(), refer: new Set<string>(), result: new Set<string>(), review: new Set<string>(), any: new Set<string>() };
    scoped.forEach((log) => {
      if (log.renew_4r) { sets.renew.add(log.client_id); sets.any.add(log.client_id); }
      if (log.refer_4r) { sets.refer.add(log.client_id); sets.any.add(log.client_id); }
      if (log.result_4r) { sets.result.add(log.client_id); sets.any.add(log.client_id); }
      if (log.review_4r) { sets.review.add(log.client_id); sets.any.add(log.client_id); }
    });
    return {
      renew: sets.renew.size,
      refer: sets.refer.size,
      result: sets.result.size,
      review: sets.review.size,
      reports: scoped.length,
      clients: sets.any.size,
      label,
    };
  }, [data, fourRMonth, coachFilter, profilesById]);

  const selected = data?.clients.find((client) => client.id === selectedClientId) || null;
  const selectedStatus = selected ? statusesByClient.get(selected.id) : undefined;
  const selectedLogs = selected ? logsByClient.get(selected.id) || [] : [];
  const selectedSessions = selected ? sessionsByClient.get(selected.id) || [] : [];
  const selectedCoachId = selected
    ? selectedStatus?.nutrition_coach_id || selected.assigned_nutrition_coach_id || ""
    : "";
  const selectedFourR = fourRFlags(selectedLogs, fourRMonth);

  async function patchClient(clientId: string, patch: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await staffFetch("/api/nutrition", { method: "PATCH", body: JSON.stringify({ clientId, ...patch }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  function read4RForm(formData: FormData) {
    return {
      renew4r: formData.get("renew4r") === "on",
      renew4rDetail: formData.get("renew4rDetail"),
      refer4r: formData.get("refer4r") === "on",
      refer4rDetail: formData.get("refer4rDetail"),
      result4r: formData.get("result4r") === "on",
      result4rDetail: formData.get("result4rDetail"),
      review4r: formData.get("review4r") === "on",
      review4rDetail: formData.get("review4rDetail"),
    };
  }

  async function submitFollow(formData: FormData) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await staffFetch("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({
          clientId: selected.id,
          nutritionCoachId: formData.get("nutritionCoachId") || null,
          method: formData.get("method"),
          clientResponded: formData.get("clientResponded") === "yes",
          nutritionSummary: formData.get("nutritionSummary"),
          bodyComp: formData.get("bodyComp"),
          activity: formData.get("activity"),
          currentIssue: formData.get("currentIssue"),
          actionTaken: formData.get("actionTaken"),
          followResult: formData.get("followResult"),
          nextAction: formData.get("nextAction"),
          nextFollowAt: formData.get("nextFollowAt"),
          outcome: formData.get("outcome"),
          ...read4RForm(formData),
        }),
      });
      setShowFollowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save follow report.");
    } finally {
      setSaving(false);
    }
  }

  async function save4R(logId: string, formData: FormData) {
    setSaving(true);
    setError("");
    try {
      await staffFetch("/api/nutrition", {
        method: "PUT",
        body: JSON.stringify({ logId, ...read4RForm(formData) }),
      });
      setEditing4RLogId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update 4R.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <div className="mx-auto max-w-[1500px] p-4 md:p-6">
        <header className="mb-5 flex flex-col gap-4 rounded-3xl border border-yellow-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.11),_transparent_32%),#0e0e0e] p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-1 text-3xl font-black md:text-5xl">Nutrition Management</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Follow workflow, nutrition scan history và 4R trong cùng một nơi.</p>
            {data ? <p className="mt-3 text-xs text-zinc-500">{data.viewer.fullName} · {data.viewer.role}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link href="/staff" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-zinc-300">Staff Tools</Link>
            {(data?.viewer.role === "admin" || data?.viewer.role === "manager") ? <Link href="/admin" className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-black text-black">Admin</Link> : null}
          </div>
        </header>

        {error ? <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Cần Follow", summary.need, "text-rose-300"],
            ["Overdue", summary.overdue, "text-orange-300"],
            ["Đang xử lý", summary.progress, "text-sky-300"],
            ["Đang chờ", summary.waiting, "text-violet-300"],
            ["Đã Follow", summary.followed, "text-emerald-300"],
            ["Chưa phân loại", summary.unreviewed, "text-yellow-300"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
              <p className={`mt-1 text-3xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="mb-5 rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.045] p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-yellow-400">Monthly KPI</p>
              <h2 className="mt-1 text-2xl font-black">4R · {formatMonthLabel(fourRMonth)}</h2>
              <p className="mt-1 text-xs text-zinc-400">{fourRMetrics.label} · tính theo khách unique</p>
            </div>
            <p className="text-xs text-zinc-500">{fourRMetrics.reports} follow reports · {fourRMetrics.clients} khách có ít nhất 1R</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {FOUR_R.map((item) => (
              <div key={item.key} className="rounded-2xl border border-white/[0.08] bg-black/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className={`text-sm font-black ${item.color}`}>{item.label}</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">{item.help}</p></div>
                  <p className="text-4xl font-black">{fourRMetrics[item.key]}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">Từ giờ mỗi 4R được tick phải có nội dung cụ thể. Có thể mở Follow History để sửa lại 4R sau.</p>
        </section>

        <section className="mb-4 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {([[
              "action", "Action Required"], ["all", "Tất cả khách"], ["followed", "Đã Follow"], ["no_follow", "Không cần Follow"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setView(key)} className={`rounded-xl px-3 py-2 text-xs font-bold ${view === key ? "bg-yellow-400 text-black" : "border border-white/10 bg-black/30 text-zinc-400"}`}>{label}</button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm khách hàng..." className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm outline-none focus:border-yellow-400" />
            <select value={requirementFilter} onChange={(e) => setRequirementFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm"><option value="all">Follow Requirement: All</option>{Object.entries(FOLLOW_REQUIREMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm"><option value="all">Status: All</option>{Object.entries(WORKFLOW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm"><option value="all">Coach: All</option><option value="unassigned">Chưa phân công</option>{nutritionCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name || coach.email}</option>)}</select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm"><option value="all">Priority: All</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="none">No priority</option></select>
          </div>
        </section>

        {loading ? <div className="rounded-3xl border border-white/10 p-10 text-center text-yellow-300">Loading Nutrition...</div> : (
          <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0d0d0d]">
            <div className="border-b border-white/[0.07] px-4 py-3 text-xs text-zinc-500">Showing {rows.length} clients · Overdue + Priority được đưa lên đầu</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="bg-yellow-400 text-black"><tr><th className="px-4 py-3">Khách hàng</th><th className="px-3 py-3">Need Follow</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Nutrition Coach</th><th className="px-3 py-3">4R tháng</th><th className="px-3 py-3">Nutrition Scan</th><th className="px-3 py-3">Last Report</th><th className="px-3 py-3">Next Follow</th><th className="px-3 py-3">PT</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const achieved = FOUR_R.filter((item) => row.fourR[item.key]);
                    return <tr key={row.client.id} className={`border-b border-white/[0.06] hover:bg-white/[0.04] ${row.overdue ? "bg-rose-500/[0.045]" : ""}`}>
                      <td className="px-4 py-3"><p className="font-bold">{row.client.full_name}</p><p className="text-xs text-zinc-600">{row.client.client_code || "—"}</p></td>
                      <td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${requirementClass(row.requirement)}`}>{FOLLOW_REQUIREMENT_LABELS[row.requirement]}</span></td>
                      <td className={`px-3 py-3 font-semibold ${statusClass(row.workflowStatus)}`}>{WORKFLOW_STATUS_LABELS[row.workflowStatus]}</td>
                      <td className="px-3 py-3 font-black">{row.priority ? PRIORITY_LABELS[row.priority] : "—"}</td>
                      <td className="px-3 py-3">{row.coachName}</td>
                      <td className="px-3 py-3">{achieved.length ? <div className="flex flex-wrap gap-1">{achieved.map((item) => <span key={item.key} className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-bold">{item.label}</span>)}</div> : <span className="text-zinc-700">—</span>}</td>
                      <td className="px-3 py-3"><p className="font-bold text-cyan-300">{row.sessions.length}</p><p className="text-[10px] text-zinc-600">{row.latestScan ? formatDateTime(row.latestScan.created_at) : "No scan"}</p></td>
                      <td className="px-3 py-3">{row.latestLog ? formatDateTime(row.latestLog.follow_date) : "—"}</td>
                      <td className={`px-3 py-3 ${row.overdue ? "font-black text-rose-300" : ""}`}>{row.overdue ? "⚠ " : ""}{formatDate(row.saved?.next_follow_at)}</td>
                      <td className="px-3 py-3 text-zinc-400">{row.trainerName}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => { setSelectedClientId(row.client.id); setShowFollowForm(false); setEditing4RLogId(null); }} className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black">Open</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {selected ? <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onMouseDown={() => setSelectedClientId(null)}>
        <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-yellow-400/20 bg-[#0b0b0b] p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
          <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-yellow-400">Nutrition Client</p><h2 className="mt-1 text-3xl font-black">{selected.full_name}</h2><p className="text-sm text-zinc-500">{selected.client_code || "No client code"}</p></div><button onClick={() => setSelectedClientId(null)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400">Close</button></div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">Follow Requirement<select disabled={!data?.permissions.canEditRequirement || saving} value={selectedStatus?.follow_requirement || "unreviewed"} onChange={(e) => void patchClient(selected.id, { followRequirement: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">{Object.entries(FOLLOW_REQUIREMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Workflow Status<select disabled={!data?.permissions.canRecordFollow || saving} value={selectedStatus?.workflow_status || "not_started"} onChange={(e) => void patchClient(selected.id, { workflowStatus: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">{Object.entries(WORKFLOW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Priority<select disabled={!data?.permissions.canManageAssignments || saving} value={selectedStatus?.priority || ""} onChange={(e) => void patchClient(selected.id, { priority: e.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50"><option value="">No priority</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option></select></label>
            <label className="text-xs text-zinc-400">Nutrition Coach<select disabled={!data?.permissions.canManageAssignments || saving} value={selectedCoachId} onChange={(e) => void patchClient(selected.id, { nutritionCoachId: e.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50"><option value="">Chưa phân công</option>{nutritionCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name || coach.email}</option>)}</select></label>
            <label className="text-xs text-zinc-400 sm:col-span-2">Reason<select disabled={!data?.permissions.canEditRequirement || saving} value={selectedStatus?.follow_reason || ""} onChange={(e) => void patchClient(selected.id, { followReason: e.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50"><option value="">No reason</option>{FOLLOW_REASON_OPTIONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Next Follow<input type="date" disabled={saving} value={selectedStatus?.next_follow_at || ""} onChange={(e) => void patchClient(selected.id, { nextFollowAt: e.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white" /></label>
          </div>

          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Client 4R</p><h3 className="mt-1 font-black">{formatMonthLabel(fourRMonth)}</h3></div><p className="text-xs text-zinc-500">{FOUR_R.filter((item) => selectedFourR[item.key]).length}/4 achieved</p></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{FOUR_R.map((item) => { const achieved = selectedFourR[item.key]; return <div key={item.key} className={`rounded-xl border px-3 py-2 text-center text-xs font-black ${achieved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] bg-black/30 text-zinc-600"}`}>{achieved ? "✓ " : ""}{item.label}</div>; })}</div>
          </section>

          <section className="mt-5 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.035] p-4">
            <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Scanner Data</p><h3 className="mt-1 text-lg font-black">Scanned Nutrition Follow-ups</h3><p className="mt-1 text-xs text-zinc-500">Dữ liệu lấy trực tiếp từ QR nutrition scan, không nhập lại.</p></div><span className="text-xs font-bold text-cyan-300">{selectedSessions.length} scans</span></div>
            <div className="space-y-3">
              {selectedSessions.map((session) => <article key={session.id} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{formatDateTime(session.created_at)}</p><p className="text-xs text-zinc-500">{session.trainer_id ? profilesById.get(session.trainer_id)?.full_name || profilesById.get(session.trainer_id)?.email || "Coach" : "Coach"}</p></div><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-300">{session.status || "success"}</span></div>
                <div className="mt-3 space-y-2 text-sm"><p><span className="font-bold text-zinc-500">Topic:</span> {session.session_topic || "—"}</p><p className="whitespace-pre-wrap"><span className="font-bold text-zinc-500">Content:</span> {session.session_content || "—"}</p>{session.trainer_note && session.trainer_note !== session.session_content ? <p className="whitespace-pre-wrap"><span className="font-bold text-zinc-500">Note:</span> {session.trainer_note}</p> : null}</div>
              </article>)}
              {!selectedSessions.length ? <p className="rounded-2xl border border-white/[0.08] p-5 text-center text-sm text-zinc-500">Khách này chưa có nutrition follow-up được scan.</p> : null}
            </div>
          </section>

          {data?.permissions.canRecordFollow ? <button onClick={() => setShowFollowForm((value) => !value)} className="mt-5 w-full rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-black">+ Record Follow Report</button> : null}

          {showFollowForm ? <form action={submitFollow} className="mt-4 space-y-3 rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.04] p-4">
            <h3 className="font-black">New Follow Report</h3>
            {(data?.viewer.role === "admin" || data?.viewer.role === "manager") ? <select name="nutritionCoachId" defaultValue={selectedCoachId} className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm"><option value="">Current assignment</option>{nutritionCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name || coach.email}</option>)}</select> : null}
            <div className="grid gap-3 sm:grid-cols-2"><select name="method" defaultValue="chat" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm">{Object.entries(FOLLOW_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select name="clientResponded" defaultValue="yes" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm"><option value="yes">Khách có phản hồi</option><option value="no">Không phản hồi</option></select></div>
            {[["nutritionSummary","Ăn uống / compliance"],["bodyComp","Weight / body comp"],["activity","Training / activity"],["currentIssue","Vấn đề hiện tại"],["actionTaken","Action đã làm"],["followResult","Kết quả follow"],["nextAction","Next action"]].map(([name, placeholder]) => <textarea key={name} name={name} placeholder={placeholder} rows={2} className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm outline-none focus:border-yellow-400" />)}
            <div className="grid gap-3 sm:grid-cols-2"><input name="nextFollowAt" type="date" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm" /><select name="outcome" defaultValue="complete" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm">{Object.entries(FOLLOW_OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-3"><p className="text-xs font-black uppercase tracking-widest text-yellow-400">4R đạt được</p><p className="mt-1 text-[11px] text-zinc-500">Tick R nào thì bắt buộc ghi nội dung R đó.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{FOUR_R.map((item) => <div key={item.key} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" name={item.formFlag} /><span className={item.color}>{item.label}</span></label><p className="mt-1 text-[11px] leading-4 text-zinc-500">{item.help}</p><textarea name={item.formDetail} rows={2} placeholder={`Nội dung ${item.label}...`} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs outline-none focus:border-yellow-400" /></div>)}</div></div>
            <button disabled={saving} className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50">{saving ? "Saving..." : "Submit Follow"}</button>
          </form> : null}

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black">Follow Report History</h3><span className="text-xs text-zinc-500">{selectedLogs.length} records</span></div>
            <div className="space-y-3">
              {selectedLogs.map((log) => {
                const canEdit4R = data?.viewer.role === "admin" || data?.viewer.role === "manager" || (data?.viewer.role === "nutrition_coach" && log.nutrition_coach_id === data.viewer.id);
                return <article key={log.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{formatDateTime(log.follow_date)}</p><p className="text-xs text-zinc-500">{profilesById.get(log.nutrition_coach_id)?.full_name || "Nutrition Coach"} · {FOLLOW_METHOD_LABELS[log.method]}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-zinc-300">{FOLLOW_OUTCOME_LABELS[log.outcome]}</span>{canEdit4R ? <button type="button" onClick={() => setEditing4RLogId(editing4RLogId === log.id ? null : log.id)} className="rounded-lg border border-yellow-400/20 px-2 py-1 text-[10px] font-black text-yellow-300">{editing4RLogId === log.id ? "Cancel" : "Edit 4R"}</button> : null}</div></div>
                  {log.current_issue ? <p className="mt-3 text-sm"><span className="text-zinc-500">Issue:</span> {log.current_issue}</p> : null}
                  {log.action_taken ? <p className="mt-1 text-sm"><span className="text-zinc-500">Action:</span> {log.action_taken}</p> : null}
                  {log.follow_result ? <p className="mt-1 text-sm"><span className="text-zinc-500">Result:</span> {log.follow_result}</p> : null}
                  {log.next_action ? <p className="mt-1 text-sm"><span className="text-zinc-500">Next:</span> {log.next_action}</p> : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">{FOUR_R.filter((item) => log[item.flag]).map((item) => <div key={item.key} className="rounded-xl border border-white/[0.08] bg-black/30 p-3"><p className={`text-xs font-black ${item.color}`}>{item.label}</p><p className="mt-1 whitespace-pre-wrap text-xs text-zinc-300">{log[item.detail] || "Legacy record — chưa có nội dung chi tiết. Hãy dùng Edit 4R để bổ sung."}</p></div>)}</div>

                  {editing4RLogId === log.id ? <form action={(formData) => save4R(log.id, formData)} className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.035] p-3"><p className="text-xs font-black uppercase tracking-widest text-yellow-400">Edit 4R</p><p className="mt-1 text-[11px] text-zinc-500">Nếu bật một R, nội dung tương ứng là bắt buộc.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{FOUR_R.map((item) => <div key={item.key} className="rounded-xl border border-white/[0.08] bg-black/30 p-3"><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" name={item.formFlag} defaultChecked={Boolean(log[item.flag])} /><span className={item.color}>{item.label}</span></label><textarea name={item.formDetail} defaultValue={log[item.detail] || ""} rows={2} placeholder={`Ghi rõ ${item.label}...`} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs outline-none focus:border-yellow-400" /></div>)}</div><button disabled={saving} className="mt-3 w-full rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-black text-black disabled:opacity-50">{saving ? "Saving..." : "Save 4R Changes"}</button></form> : null}
                </article>;
              })}
              {!selectedLogs.length ? <p className="rounded-2xl border border-white/[0.08] p-5 text-center text-sm text-zinc-500">Chưa có follow report.</p> : null}
            </div>
          </section>
        </aside>
      </div> : null}
    </main>
  );
}
