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
  review_4r: boolean;
  refer_4r: boolean;
  renew_4r: boolean;
  created_at: string;
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
};

type ViewKey = "action" | "all" | "followed" | "no_follow";
type FourRName = "Renew" | "Refer" | "Result" | "Review";
type FourRFlags = { renew: boolean; refer: boolean; result: boolean; review: boolean };

const FOUR_R_DEFINITIONS: Array<{
  name: FourRName;
  key: keyof FourRFlags;
  formName: "renew4r" | "refer4r" | "result4r" | "review4r";
  description: string;
  color: string;
}> = [
  {
    name: "Renew",
    key: "renew",
    formName: "renew4r",
    description: "Khách đã gia hạn hoặc xác nhận renewal.",
    color: "text-emerald-300",
  },
  {
    name: "Refer",
    key: "refer",
    formName: "refer4r",
    description: "Khách đã giới thiệu referral/lead mới.",
    color: "text-sky-300",
  },
  {
    name: "Result",
    key: "result",
    formName: "result4r",
    description: "Có kết quả/progress thực tế có thể ghi nhận.",
    color: "text-yellow-300",
  },
  {
    name: "Review",
    key: "review",
    formName: "review4r",
    description: "Đã nhận review/testimonial, ví dụ Google hoặc Facebook.",
    color: "text-violet-300",
  },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
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
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const date = new Date(`${month}-15T12:00:00Z`);
  return date.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "America/Toronto",
  });
}

function fourRFlagsForLogs(logs: FollowLog[], month: string): FourRFlags {
  const monthLogs = logs.filter((log) => torontoMonth(log.follow_date) === month);
  return {
    renew: monthLogs.some((log) => log.renew_4r),
    refer: monthLogs.some((log) => log.refer_4r),
    result: monthLogs.some((log) => log.result_4r),
    review: monthLogs.some((log) => log.review_4r),
  };
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
  const [saving, setSaving] = useState(false);
  const [showFollowForm, setShowFollowForm] = useState(false);
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

  const nutritionCoaches = useMemo(
    () => data?.profiles.filter((profile) => profile.role === "nutrition_coach") || [],
    [data],
  );

  const fourRMetrics = useMemo(() => {
    const empty = {
      renew: 0,
      refer: 0,
      result: 0,
      review: 0,
      clientsWithAny: 0,
      followReports: 0,
      scopeLabel: "Nutrition Team",
    };
    if (!data) return empty;

    let scoped = data.logs.filter((log) => torontoMonth(log.follow_date) === fourRMonth);
    let scopeLabel = "Nutrition Team";

    if (data.viewer.role === "nutrition_coach") {
      scoped = scoped.filter((log) => log.nutrition_coach_id === data.viewer.id);
      scopeLabel = data.viewer.fullName || "My 4R";
    } else if (coachFilter === "unassigned") {
      scoped = [];
      scopeLabel = "Unassigned";
    } else if (coachFilter !== "all") {
      scoped = scoped.filter((log) => log.nutrition_coach_id === coachFilter);
      const coach = profilesById.get(coachFilter);
      scopeLabel = coach?.full_name || coach?.email || "Selected Coach";
    }

    const renew = new Set<string>();
    const refer = new Set<string>();
    const result = new Set<string>();
    const review = new Set<string>();
    const any = new Set<string>();

    for (const log of scoped) {
      if (log.renew_4r) {
        renew.add(log.client_id);
        any.add(log.client_id);
      }
      if (log.refer_4r) {
        refer.add(log.client_id);
        any.add(log.client_id);
      }
      if (log.result_4r) {
        result.add(log.client_id);
        any.add(log.client_id);
      }
      if (log.review_4r) {
        review.add(log.client_id);
        any.add(log.client_id);
      }
    }

    return {
      renew: renew.size,
      refer: refer.size,
      result: result.size,
      review: review.size,
      clientsWithAny: any.size,
      followReports: scoped.length,
      scopeLabel,
    };
  }, [data, fourRMonth, coachFilter, profilesById]);

  const rows = useMemo(() => {
    if (!data) return [];
    const searchText = search.trim().toLowerCase();

    return data.clients
      .map((client) => {
        const saved = statusesByClient.get(client.id);
        const logs = logsByClient.get(client.id) || [];
        const requirement = saved?.follow_requirement || "unreviewed";
        const workflowStatus = saved?.workflow_status || "not_started";
        const priority = saved?.priority || null;
        const coachId = saved?.nutrition_coach_id || client.assigned_nutrition_coach_id || null;
        const coach = coachId ? profilesById.get(coachId) : null;
        const trainer = client.assigned_trainer_id
          ? profilesById.get(client.assigned_trainer_id)
          : null;
        const latestLog = logs[0] || null;
        const overdue = isOverdue(saved?.next_follow_at, workflowStatus);
        return {
          client,
          saved,
          logs,
          requirement,
          workflowStatus,
          priority,
          coachId,
          coachName: coach?.full_name || coach?.email || "Chưa phân công",
          trainerName: trainer?.full_name || trainer?.email || "—",
          latestLog,
          overdue,
          fourR: fourRFlagsForLogs(logs, fourRMonth),
        };
      })
      .filter((row) => {
        if (searchText) {
          const haystack = `${row.client.client_code || ""} ${row.client.full_name} ${row.coachName} ${row.trainerName}`.toLowerCase();
          if (!haystack.includes(searchText)) return false;
        }
        if (coachFilter !== "all" && (row.coachId || "unassigned") !== coachFilter) return false;
        if (statusFilter !== "all" && row.workflowStatus !== statusFilter) return false;
        if (requirementFilter !== "all" && row.requirement !== requirementFilter) return false;
        if (priorityFilter !== "all" && (row.priority || "none") !== priorityFilter) return false;

        if (view === "action") {
          return (
            row.requirement === "need_follow" &&
            row.workflowStatus !== "followed"
          );
        }
        if (view === "followed") return row.workflowStatus === "followed";
        if (view === "no_follow") return row.requirement === "no_follow";
        return true;
      })
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        const priorityRank = { p1: 0, p2: 1, p3: 2, none: 3 } as const;
        const aRank = priorityRank[(a.priority || "none") as keyof typeof priorityRank];
        const bRank = priorityRank[(b.priority || "none") as keyof typeof priorityRank];
        if (aRank !== bRank) return aRank - bRank;
        const aDate = a.saved?.next_follow_at || "9999-12-31";
        const bDate = b.saved?.next_follow_at || "9999-12-31";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return a.client.full_name.localeCompare(b.client.full_name);
      });
  }, [data, search, coachFilter, statusFilter, requirementFilter, priorityFilter, view, statusesByClient, logsByClient, profilesById, fourRMonth]);

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

  const selected = data?.clients.find((client) => client.id === selectedClientId) || null;
  const selectedStatus = selected ? statusesByClient.get(selected.id) : undefined;
  const selectedLogs = selected ? logsByClient.get(selected.id) || [] : [];
  const selectedCoachId = selected
    ? selectedStatus?.nutrition_coach_id || selected.assigned_nutrition_coach_id || ""
    : "";
  const selectedFourR = fourRFlagsForLogs(selectedLogs, fourRMonth);

  async function patchClient(clientId: string, patch: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await staffFetch("/api/nutrition", {
        method: "PATCH",
        body: JSON.stringify({ clientId, ...patch }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
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
          result4r: formData.get("result4r") === "on",
          review4r: formData.get("review4r") === "on",
          refer4r: formData.get("refer4r") === "on",
          renew4r: formData.get("renew4r") === "on",
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

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <div className="mx-auto max-w-[1500px] p-4 md:p-6">
        <header className="mb-5 flex flex-col gap-4 rounded-3xl border border-yellow-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.11),_transparent_32%),#0e0e0e] p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-1 text-3xl font-black md:text-5xl">Nutrition Management</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Toàn bộ khách hàng, tình trạng follow, coach phụ trách và lịch sử xử lý trong một nơi.</p>
            {data ? <p className="mt-3 text-xs text-zinc-500">{data.viewer.fullName} · {data.viewer.role}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link href="/staff" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-zinc-300 hover:border-yellow-400/40 hover:text-yellow-300">Staff Tools</Link>
            {(data?.viewer.role === "admin" || data?.viewer.role === "manager") ? (
              <Link href="/admin" className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-black hover:bg-yellow-300">Admin</Link>
            ) : null}
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

        <section className="mb-5 rounded-3xl border border-yellow-400/20 bg-[linear-gradient(135deg,rgba(250,204,21,0.08),rgba(255,255,255,0.025))] p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-yellow-400">Monthly KPI</p>
              <h2 className="mt-1 text-2xl font-black">4R · {formatMonthLabel(fourRMonth)}</h2>
              <p className="mt-1 text-xs text-zinc-400">Renew · Refer · Result · Review — {fourRMetrics.scopeLabel}</p>
            </div>
            <div className="text-xs text-zinc-500 md:text-right">
              <p>{fourRMetrics.followReports} follow reports trong scope</p>
              <p>{fourRMetrics.clientsWithAny} khách có ít nhất 1 chỉ số 4R</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {FOUR_R_DEFINITIONS.map((item) => (
              <div key={item.name} className="rounded-2xl border border-white/[0.08] bg-black/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-black ${item.color}`}>{item.name}</p>
                    <p className="mt-1 text-[11px] leading-4 text-zinc-500">{item.description}</p>
                  </div>
                  <p className="text-4xl font-black text-white">{fourRMetrics[item.key]}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-5 text-zinc-500">
            KPI tính theo khách unique trong từng tháng Toronto: cùng một khách được đánh dấu cùng một R nhiều lần vẫn chỉ tính 1 lần cho R đó. Chỉ tick 4R khi đã đạt kết quả thực tế, không tick chỉ vì đã hỏi khách.
          </p>
        </section>

        <section className="mb-4 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              ["action", "Action Required"],
              ["all", "Tất cả khách"],
              ["followed", "Đã Follow"],
              ["no_follow", "Không cần Follow"],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setView(key)} className={`rounded-xl px-3 py-2 text-xs font-bold ${view === key ? "bg-yellow-400 text-black" : "border border-white/10 bg-black/30 text-zinc-400"}`}>{label}</button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm khách hàng..." className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm outline-none focus:border-yellow-400" />
            <select value={requirementFilter} onChange={(event) => setRequirementFilter(event.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm">
              <option value="all">Follow Requirement: All</option>
              {Object.entries(FOLLOW_REQUIREMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm">
              <option value="all">Status: All</option>
              {Object.entries(WORKFLOW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={coachFilter} onChange={(event) => setCoachFilter(event.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm">
              <option value="all">Coach: All</option>
              <option value="unassigned">Chưa phân công</option>
              {nutritionCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name || coach.email}</option>)}
            </select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm">
              <option value="all">Priority: All</option>
              <option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="none">No priority</option>
            </select>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl border border-white/10 p-10 text-center text-sm text-yellow-300">Loading Nutrition...</div>
        ) : (
          <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0d0d0d]">
            <div className="border-b border-white/[0.07] px-4 py-3 text-xs text-zinc-500">Showing {rows.length} clients · Overdue + P1/P2 được đưa lên đầu</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] text-left text-sm">
                <thead className="bg-yellow-400 text-black">
                  <tr>
                    <th className="px-4 py-3">Khách hàng</th><th className="px-3 py-3">Need Follow</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Nutrition Coach</th><th className="px-3 py-3">4R tháng</th><th className="px-3 py-3">Last Follow</th><th className="px-3 py-3">Next Follow</th><th className="px-3 py-3">PT</th><th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const achieved = FOUR_R_DEFINITIONS.filter((item) => row.fourR[item.key]);
                    return (
                      <tr key={row.client.id} className={`border-b border-white/[0.06] hover:bg-white/[0.04] ${row.overdue ? "bg-rose-500/[0.045]" : ""}`}>
                        <td className="px-4 py-3"><p className="font-bold text-white">{row.client.full_name}</p><p className="text-xs text-zinc-600">{row.client.client_code || "—"}</p></td>
                        <td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${requirementClass(row.requirement)}`}>{FOLLOW_REQUIREMENT_LABELS[row.requirement]}</span></td>
                        <td className={`px-3 py-3 font-semibold ${statusClass(row.workflowStatus)}`}>{WORKFLOW_STATUS_LABELS[row.workflowStatus]}</td>
                        <td className="px-3 py-3 font-black">{row.priority ? PRIORITY_LABELS[row.priority] : "—"}</td>
                        <td className="px-3 py-3">{row.coachName}</td>
                        <td className="px-3 py-3">
                          {achieved.length ? (
                            <div className="flex max-w-[190px] flex-wrap gap-1">
                              {achieved.map((item) => <span key={item.name} className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">{item.name}</span>)}
                            </div>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-3">{row.latestLog ? formatDateTime(row.latestLog.follow_date) : "—"}</td>
                        <td className={`px-3 py-3 ${row.overdue ? "font-black text-rose-300" : "text-zinc-300"}`}>{row.overdue ? "⚠ " : ""}{formatDate(row.saved?.next_follow_at)}</td>
                        <td className="px-3 py-3 text-zinc-400">{row.trainerName}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => { setSelectedClientId(row.client.id); setShowFollowForm(false); }} className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300">Open</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!rows.length ? <p className="p-8 text-center text-sm text-zinc-500">Không có khách phù hợp bộ lọc.</p> : null}
          </section>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onMouseDown={() => setSelectedClientId(null)}>
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-yellow-400/20 bg-[#0b0b0b] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-widest text-yellow-400">Nutrition Client</p><h2 className="mt-1 text-3xl font-black">{selected.full_name}</h2><p className="text-sm text-zinc-500">{selected.client_code || "No client code"}</p></div>
              <button onClick={() => setSelectedClientId(null)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400">Close</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">Follow Requirement
                <select disabled={!data?.permissions.canEditRequirement || saving} value={selectedStatus?.follow_requirement || "unreviewed"} onChange={(event) => void patchClient(selected.id, { followRequirement: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  {Object.entries(FOLLOW_REQUIREMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400">Workflow Status
                <select disabled={!data?.permissions.canRecordFollow || saving} value={selectedStatus?.workflow_status || "not_started"} onChange={(event) => void patchClient(selected.id, { workflowStatus: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  {Object.entries(WORKFLOW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400">Priority
                <select disabled={!data?.permissions.canManageAssignments || saving} value={selectedStatus?.priority || ""} onChange={(event) => void patchClient(selected.id, { priority: event.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  <option value="">No priority</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option>
                </select>
              </label>
              <label className="text-xs text-zinc-400">Nutrition Coach
                <select disabled={!data?.permissions.canManageAssignments || saving} value={selectedCoachId} onChange={(event) => void patchClient(selected.id, { nutritionCoachId: event.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  <option value="">Chưa phân công</option>{nutritionCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name || coach.email}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400 sm:col-span-2">Reason
                <select disabled={!data?.permissions.canEditRequirement || saving} value={selectedStatus?.follow_reason || ""} onChange={(event) => void patchClient(selected.id, { followReason: event.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  <option value="">No reason</option>{FOLLOW_REASON_OPTIONS.map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </label>
              <label className="text-xs text-zinc-400">Next Follow
                <input type="date" disabled={saving} value={selectedStatus?.next_follow_at || ""} onChange={(event) => void patchClient(selected.id, { nextFollowAt: event.target.value || null })} className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white" />
              </label>
            </div>

            <section className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Client 4R</p>
                  <h3 className="mt-1 font-black">{formatMonthLabel(fourRMonth)}</h3>
                </div>
                <p className="text-xs text-zinc-500">{FOUR_R_DEFINITIONS.filter((item) => selectedFourR[item.key]).length}/4 achieved</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FOUR_R_DEFINITIONS.map((item) => {
                  const achieved = selectedFourR[item.key];
                  return <div key={item.name} className={`rounded-xl border px-3 py-2 text-center text-xs font-black ${achieved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] bg-black/30 text-zinc-600"}`}>{achieved ? "✓ " : ""}{item.name}</div>;
                })}
              </div>
            </section>

            {data?.permissions.canRecordFollow ? <button onClick={() => setShowFollowForm((value) => !value)} className="mt-5 w-full rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300">+ Record Follow</button> : null}

            {showFollowForm ? (
              <form action={submitFollow} className="mt-4 space-y-3 rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.04] p-4">
                <h3 className="font-black">New Follow Report</h3>
                {(data?.viewer.role === "admin" || data?.viewer.role === "manager") ? <select name="nutritionCoachId" defaultValue={selectedCoachId} className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm"><option value="">Current user</option>{nutritionCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name || coach.email}</option>)}</select> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <select name="method" defaultValue="chat" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm">{Object.entries(FOLLOW_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select name="clientResponded" defaultValue="yes" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm"><option value="yes">Khách có phản hồi</option><option value="no">Không phản hồi</option></select>
                </div>
                {[ ["nutritionSummary","Ăn uống / compliance"], ["bodyComp","Weight / body comp"], ["activity","Training / activity"], ["currentIssue","Vấn đề hiện tại"], ["actionTaken","Action đã làm"], ["followResult","Kết quả follow"], ["nextAction","Next action"] ].map(([name, placeholder]) => <textarea key={name} name={name} placeholder={placeholder} rows={2} className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm outline-none focus:border-yellow-400" />)}
                <div className="grid gap-3 sm:grid-cols-2"><input name="nextFollowAt" type="date" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm" /><select name="outcome" defaultValue="complete" className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm">{Object.entries(FOLLOW_OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-yellow-400">4R đạt được trong lần follow này</p>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">Chỉ tick khi kết quả đã thực sự xảy ra. Việc hỏi khách về renewal/review/referral chưa được tính là 4R.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {FOUR_R_DEFINITIONS.map((item) => (
                      <label key={item.formName} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                        <input type="checkbox" name={item.formName} className="mt-1" />
                        <span><span className={`block text-sm font-black ${item.color}`}>{item.name}</span><span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{item.description}</span></span>
                      </label>
                    ))}
                  </div>
                </div>

                <button disabled={saving} className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50">{saving ? "Saving..." : "Submit Follow"}</button>
              </form>
            ) : null}

            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black">Follow History</h3><span className="text-xs text-zinc-500">{selectedLogs.length} records</span></div>
              <div className="space-y-3">
                {selectedLogs.map((log) => {
                  const achieved = [log.renew_4r && "Renew", log.refer_4r && "Refer", log.result_4r && "Result", log.review_4r && "Review"].filter(Boolean);
                  return (
                    <article key={log.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{formatDateTime(log.follow_date)}</p><p className="text-xs text-zinc-500">{profilesById.get(log.nutrition_coach_id)?.full_name || "Nutrition Coach"} · {FOLLOW_METHOD_LABELS[log.method]}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-zinc-300">{FOLLOW_OUTCOME_LABELS[log.outcome]}</span></div>
                      {log.current_issue ? <p className="mt-3 text-sm"><span className="text-zinc-500">Issue:</span> {log.current_issue}</p> : null}
                      {log.action_taken ? <p className="mt-1 text-sm"><span className="text-zinc-500">Action:</span> {log.action_taken}</p> : null}
                      {log.follow_result ? <p className="mt-1 text-sm"><span className="text-zinc-500">Result:</span> {log.follow_result}</p> : null}
                      {log.next_action ? <p className="mt-1 text-sm"><span className="text-zinc-500">Next:</span> {log.next_action}</p> : null}
                      <p className="mt-2 text-xs text-zinc-600">Next follow: {formatDate(log.next_follow_at)} · 4R: {achieved.join(", ") || "—"}</p>
                    </article>
                  );
                })}
                {!selectedLogs.length ? <p className="rounded-2xl border border-white/[0.08] p-5 text-center text-sm text-zinc-500">Chưa có lịch sử follow.</p> : null}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
