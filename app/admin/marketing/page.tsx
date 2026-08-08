"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type MarketingRole = "admin" | "manager" | "marketing_manager";
type ReportStatus = "draft" | "submitted" | "reviewed" | "approved";
type ActionStatus = "not_started" | "in_progress" | "blocked" | "done";
type ActionPriority = "high" | "medium" | "low";
type Distribution = "organic" | "paid" | "mixed";
type MarketingTab =
  | "overview"
  | "campaigns"
  | "content"
  | "calendar"
  | "audience"
  | "reports"
  | "actions";

type MarketingReport = {
  id: string;
  report_month: string;
  status: ReportStatus;
  views: number | string;
  reach: number | string;
  interactions: number | string;
  link_clicks: number | string;
  followers_gained: number | string;
  ad_spend: number | string;
  revenue_attributed: number | string;
  summary: string | null;
  wins: string | null;
  issues: string | null;
  next_steps: string | null;
  updated_at: string;
};

type MarketingCampaign = {
  id: string;
  report_id: string;
  platform: string;
  campaign_name: string;
  objective: string | null;
  spend: number | string;
  impressions: number | string;
  reach: number | string;
  clicks: number | string;
  leads: number | string;
  demo_booked: number | string;
  demo_attended: number | string;
  clients_closed: number | string;
  revenue_attributed: number | string;
  notes: string | null;
};

type MarketingContent = {
  id: string;
  report_id: string;
  publish_date: string;
  platform: string;
  title: string;
  pillar: string | null;
  objective: string | null;
  distribution: Distribution;
  views: number | string;
  reach: number | string;
  interactions: number | string;
  saves: number | string;
  shares: number | string;
  dms: number | string;
  leads: number | string;
  clients_closed: number | string;
  revenue_attributed: number | string;
  post_url: string | null;
  notes: string | null;
};

type AudienceSnapshot = {
  id: string;
  report_id: string;
  platform: string;
  canada_pct: number | string | null;
  gta_pct: number | string | null;
  target_age_pct: number | string | null;
  female_pct: number | string | null;
  male_pct: number | string | null;
  vietnamese_pct: number | string | null;
  notes: string | null;
};

type MarketingAction = {
  id: string;
  report_id: string;
  priority: ActionPriority;
  action_item: string;
  owner_name: string | null;
  due_date: string | null;
  target_kpi: string | null;
  status: ActionStatus;
  notes: string | null;
};

type LeadRow = {
  id: string;
  full_name?: string | null;
  source_type: string | null;
  source_detail: string | null;
  status: string | null;
  demo_at: string | null;
  converted_client_id: string | null;
  marketing_campaign_id: string | null;
  marketing_content_id: string | null;
  created_at: string;
};

type FunnelRow = {
  source: string;
  leads: number;
  contacted: number;
  demoBooked: number;
  demoAttended: number;
  noShow: number;
  converted: number;
};

const CHANNELS = [
  "All",
  "Facebook",
  "Instagram",
  "TikTok",
  "Google",
  "Website",
  "Referral",
  "Event",
  "Other",
];

const CONTENT_PILLARS = [
  "Education",
  "Entertainment",
  "Transformation",
  "Promotion",
  "Community",
  "Trust",
  "Nutrition",
  "Trainer Branding",
];

const REPORT_STATUSES: ReportStatus[] = [
  "draft",
  "submitted",
  "reviewed",
  "approved",
];

const ACTION_STATUSES: ActionStatus[] = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
];

const TABS: Array<{ id: MarketingTab; label: string; description: string }> = [
  { id: "overview", label: "Dashboard", description: "KPI, funnel và việc cần xử lý" },
  { id: "campaigns", label: "Campaigns", description: "Ngân sách, leads, CAC, ROAS" },
  { id: "content", label: "Content", description: "Bài đăng và hiệu suất" },
  { id: "calendar", label: "Content Calendar", description: "Lịch đăng và kế hoạch" },
  { id: "audience", label: "Audience", description: "Chất lượng tệp local" },
  { id: "reports", label: "Monthly Report", description: "KPI và tổng kết tháng" },
  { id: "actions", label: "Marketing Tasks", description: "Owner, deadline và KPI" },
];

function currentMonthValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthRange(monthValue: string) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return {
    reportDate: `${yearText}-${monthText}-01`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return numberValue(value).toLocaleString("en-CA", {
    maximumFractionDigits: 0,
  });
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function formatPercent(value: number) {
  return `${value.toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function sourceLabel(source: string | null, detail?: string | null) {
  const labels: Record<string, string> = {
    walk_in: "Walk-in",
    referral: "Referral",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    google: "Google",
    website: "Website",
    event: "Event",
    other_marketing: "Other Marketing",
    other: "Other",
  };

  const base = labels[String(source || "")] || source || "Unknown";
  return detail ? `${base} — ${detail}` : base;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function roleLabel(value: MarketingRole | null) {
  if (value === "marketing_manager") return "Marketing Manager";
  if (value === "manager") return "Manager";
  return "Admin";
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function inputClass() {
  return "w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400";
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
        {required ? <span className="ml-1 text-yellow-400">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

function PrimaryButton({
  children,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-400/10"
          : "border-white/15 text-zinc-300 hover:border-yellow-400/40 hover:text-yellow-300"
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.05] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-yellow-300">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm md:items-center md:p-5">
      <section className="max-h-[100dvh] w-full overflow-y-auto border border-yellow-400/25 bg-[#0b0b0b] shadow-2xl md:max-h-[92dvh] md:max-w-5xl md:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b0b0b]/95 p-5 backdrop-blur">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">
              Marketing Management
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          </div>
          <SecondaryButton onClick={onClose}>Đóng</SecondaryButton>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

export default function MarketingDashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<MarketingRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<MarketingTab>("overview");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [channelFilter, setChannelFilter] = useState("All");
  const [distributionFilter, setDistributionFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [report, setReport] = useState<MarketingReport | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [contentRows, setContentRows] = useState<MarketingContent[]>([]);
  const [audienceRows, setAudienceRows] = useState<AudienceSnapshot[]>([]);
  const [actions, setActions] = useState<MarketingAction[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [editingContent, setEditingContent] = useState<MarketingContent | null>(null);
  const [editingAudience, setEditingAudience] = useState<AudienceSnapshot | null>(null);
  const [editingAction, setEditingAction] = useState<MarketingAction | null>(null);

  const canEdit =
    role === "admin" || role === "manager" || role === "marketing_manager";
  const canDelete = role === "admin";

  const loadMonth = useCallback(async (monthValue: string) => {
    setLoading(true);
    const range = monthRange(monthValue);

    const [reportResult, leadsResult] = await Promise.all([
      supabase
        .from("marketing_monthly_reports")
        .select("*")
        .eq("report_month", range.reportDate)
        .maybeSingle(),
      supabase
        .from("leads")
        .select(
          "id, full_name, source_type, source_detail, status, demo_at, converted_client_id, marketing_campaign_id, marketing_content_id, created_at",
        )
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at", { ascending: false }),
    ]);

    if (reportResult.error || leadsResult.error) {
      alert(reportResult.error?.message || leadsResult.error?.message || "Unable to load marketing data.");
      setLoading(false);
      return;
    }

    const currentReport = reportResult.data as MarketingReport | null;
    setReport(currentReport);
    setLeads((leadsResult.data || []) as LeadRow[]);

    if (!currentReport) {
      setCampaigns([]);
      setContentRows([]);
      setAudienceRows([]);
      setActions([]);
      setLoading(false);
      return;
    }

    const [campaignResult, contentResult, audienceResult, actionResult] =
      await Promise.all([
        supabase
          .from("marketing_campaigns")
          .select("*")
          .eq("report_id", currentReport.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("marketing_content")
          .select("*")
          .eq("report_id", currentReport.id)
          .order("publish_date", { ascending: false }),
        supabase
          .from("marketing_audience_snapshots")
          .select("*")
          .eq("report_id", currentReport.id)
          .order("platform", { ascending: true }),
        supabase
          .from("marketing_actions")
          .select("*")
          .eq("report_id", currentReport.id)
          .order("due_date", { ascending: true }),
      ]);

    const firstError = [
      campaignResult.error,
      contentResult.error,
      audienceResult.error,
      actionResult.error,
    ].find(Boolean);

    if (firstError) {
      alert(firstError.message);
      setLoading(false);
      return;
    }

    setCampaigns((campaignResult.data || []) as MarketingCampaign[]);
    setContentRows((contentResult.data || []) as MarketingContent[]);
    setAudienceRows((audienceResult.data || []) as AudienceSnapshot[]);
    setActions((actionResult.data || []) as MarketingAction[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function protectPage() {
      const { user, role: currentRole } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      const normalizedRole = String(currentRole ?? "");
      const allowedRoles: MarketingRole[] = [
        "admin",
        "manager",
        "marketing_manager",
      ];

      if (!allowedRoles.includes(normalizedRole as MarketingRole)) {
        if (
          normalizedRole === "trainer" ||
          normalizedRole === "nutrition_coach"
        ) {
          router.push("/trainer/scan");
        } else {
          router.push("/client");
        }
        return;
      }

      setRole(normalizedRole as MarketingRole);
      setCheckingRole(false);
    }

    void protectPage();
  }, [router]);

  useEffect(() => {
    if (!role) return;
    void loadMonth(selectedMonth);
  }, [loadMonth, role, selectedMonth]);

  useEffect(() => {
    if (!role) return;

    const channel = supabase
      .channel(`marketing-leads-live-${selectedMonth}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => void loadMonth(selectedMonth),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMonth, role, selectedMonth]);

  const funnelRows = useMemo<FunnelRow[]>(() => {
    const map = new Map<string, FunnelRow>();

    for (const lead of leads) {
      const source = sourceLabel(lead.source_type, lead.source_detail);
      const row = map.get(source) || {
        source,
        leads: 0,
        contacted: 0,
        demoBooked: 0,
        demoAttended: 0,
        noShow: 0,
        converted: 0,
      };
      const status = String(lead.status || "").toLowerCase();

      row.leads += 1;
      if (
        [
          "contacted",
          "demo_booked",
          "demo_completed",
          "no_show",
          "interested",
          "follow_up",
          "converted",
        ].includes(status)
      ) {
        row.contacted += 1;
      }
      if (
        Boolean(lead.demo_at) ||
        ["demo_booked", "demo_completed", "no_show", "converted"].includes(status)
      ) {
        row.demoBooked += 1;
      }
      if (["demo_completed", "converted"].includes(status)) row.demoAttended += 1;
      if (status === "no_show") row.noShow += 1;
      if (status === "converted" || lead.converted_client_id) row.converted += 1;

      map.set(source, row);
    }

    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [leads]);

  const campaignLeadStats = useMemo(() => {
    const map = new Map<string, { leads: number; converted: number }>();
    for (const lead of leads) {
      if (!lead.marketing_campaign_id) continue;
      const current = map.get(lead.marketing_campaign_id) || {
        leads: 0,
        converted: 0,
      };
      current.leads += 1;
      if (lead.status === "converted" || lead.converted_client_id) {
        current.converted += 1;
      }
      map.set(lead.marketing_campaign_id, current);
    }
    return map;
  }, [leads]);

  const contentLeadStats = useMemo(() => {
    const map = new Map<string, { leads: number; converted: number }>();
    for (const lead of leads) {
      if (!lead.marketing_content_id) continue;
      const current = map.get(lead.marketing_content_id) || {
        leads: 0,
        converted: 0,
      };
      current.leads += 1;
      if (lead.status === "converted" || lead.converted_client_id) {
        current.converted += 1;
      }
      map.set(lead.marketing_content_id, current);
    }
    return map;
  }, [leads]);

  const totals = useMemo(() => {
    const converted = funnelRows.reduce((sum, row) => sum + row.converted, 0);
    const demoBooked = funnelRows.reduce((sum, row) => sum + row.demoBooked, 0);
    const demoAttended = funnelRows.reduce((sum, row) => sum + row.demoAttended, 0);
    const campaignSpend = campaigns.reduce(
      (sum, row) => sum + numberValue(row.spend),
      0,
    );
    const campaignRevenue = campaigns.reduce(
      (sum, row) => sum + numberValue(row.revenue_attributed),
      0,
    );
    const spend = campaignSpend || numberValue(report?.ad_spend);
    const revenue = campaignRevenue || numberValue(report?.revenue_attributed);

    return {
      leads: leads.length,
      converted,
      demoBooked,
      demoAttended,
      spend,
      revenue,
      closeRate: safeRate(converted, leads.length),
      showRate: safeRate(demoAttended, demoBooked),
      cpl: leads.length > 0 ? spend / leads.length : 0,
      cac: converted > 0 ? spend / converted : 0,
      roas: spend > 0 ? revenue / spend : 0,
      roi: spend > 0 ? ((revenue - spend) / spend) * 100 : 0,
    };
  }, [campaigns, funnelRows, leads.length, report]);

  const filteredCampaigns = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return campaigns.filter((row) => {
      const matchesChannel =
        channelFilter === "All" ||
        row.platform.toLowerCase() === channelFilter.toLowerCase();
      const matchesSearch =
        !query ||
        row.campaign_name.toLowerCase().includes(query) ||
        row.objective?.toLowerCase().includes(query);
      return matchesChannel && matchesSearch;
    });
  }, [campaigns, channelFilter, searchText]);

  const filteredContent = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return contentRows.filter((row) => {
      const matchesChannel =
        channelFilter === "All" ||
        row.platform.toLowerCase() === channelFilter.toLowerCase();
      const matchesDistribution =
        distributionFilter === "all" || row.distribution === distributionFilter;
      const matchesSearch =
        !query ||
        row.title.toLowerCase().includes(query) ||
        row.pillar?.toLowerCase().includes(query) ||
        row.objective?.toLowerCase().includes(query);
      return matchesChannel && matchesDistribution && matchesSearch;
    });
  }, [channelFilter, contentRows, distributionFilter, searchText]);

  const topContent = useMemo(() => {
    return [...contentRows]
      .sort((a, b) => {
        const aStats = contentLeadStats.get(a.id);
        const bStats = contentLeadStats.get(b.id);
        const aScore = (aStats?.leads ?? numberValue(a.leads)) * 100000 + numberValue(a.views);
        const bScore = (bStats?.leads ?? numberValue(b.leads)) * 100000 + numberValue(b.views);
        return bScore - aScore;
      })
      .slice(0, 5);
  }, [contentLeadStats, contentRows]);

  const followUpLeads = useMemo(
    () =>
      leads.filter((lead) =>
        ["new", "contacted", "follow_up", "interested"].includes(
          String(lead.status || "").toLowerCase(),
        ),
      ),
    [leads],
  );

  const upcomingContent = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...contentRows]
      .filter((row) => row.publish_date >= today)
      .sort((a, b) => a.publish_date.localeCompare(b.publish_date))
      .slice(0, 8);
  }, [contentRows]);

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
      report_month: monthRange(selectedMonth).reportDate,
      status: (formText(formData, "status") || "draft") as ReportStatus,
      views: formNumber(formData, "views"),
      reach: formNumber(formData, "reach"),
      interactions: formNumber(formData, "interactions"),
      link_clicks: formNumber(formData, "link_clicks"),
      followers_gained: formNumber(formData, "followers_gained"),
      ad_spend: formNumber(formData, "ad_spend"),
      revenue_attributed: formNumber(formData, "revenue_attributed"),
      summary: formText(formData, "summary") || null,
      wins: formText(formData, "wins") || null,
      issues: formText(formData, "issues") || null,
      next_steps: formText(formData, "next_steps") || null,
      updated_by: authData.user?.id || null,
      ...(report ? {} : { created_by: authData.user?.id || null }),
    };

    const query = report
      ? supabase.from("marketing_monthly_reports").update(payload).eq("id", report.id)
      : supabase.from("marketing_monthly_reports").insert(payload);

    const { error } = await query;
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadMonth(selectedMonth);
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !report) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
      report_id: report.id,
      platform: formText(formData, "platform"),
      campaign_name: formText(formData, "campaign_name"),
      objective: formText(formData, "objective") || null,
      spend: formNumber(formData, "spend"),
      impressions: formNumber(formData, "impressions"),
      reach: formNumber(formData, "reach"),
      clicks: formNumber(formData, "clicks"),
      leads: formNumber(formData, "leads"),
      demo_booked: formNumber(formData, "demo_booked"),
      demo_attended: formNumber(formData, "demo_attended"),
      clients_closed: formNumber(formData, "clients_closed"),
      revenue_attributed: formNumber(formData, "revenue_attributed"),
      notes: formText(formData, "notes") || null,
      ...(editingCampaign ? {} : { created_by: authData.user?.id || null }),
    };

    const query = editingCampaign
      ? supabase.from("marketing_campaigns").update(payload).eq("id", editingCampaign.id)
      : supabase.from("marketing_campaigns").insert(payload);
    const { error } = await query;
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setCampaignModalOpen(false);
    setEditingCampaign(null);
    await loadMonth(selectedMonth);
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !report) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
      report_id: report.id,
      publish_date: formText(formData, "publish_date"),
      platform: formText(formData, "platform"),
      title: formText(formData, "title"),
      pillar: formText(formData, "pillar") || null,
      objective: formText(formData, "objective") || null,
      distribution: (formText(formData, "distribution") || "organic") as Distribution,
      views: formNumber(formData, "views"),
      reach: formNumber(formData, "reach"),
      interactions: formNumber(formData, "interactions"),
      saves: formNumber(formData, "saves"),
      shares: formNumber(formData, "shares"),
      dms: formNumber(formData, "dms"),
      leads: formNumber(formData, "leads"),
      clients_closed: formNumber(formData, "clients_closed"),
      revenue_attributed: formNumber(formData, "revenue_attributed"),
      post_url: formText(formData, "post_url") || null,
      notes: formText(formData, "notes") || null,
      ...(editingContent ? {} : { created_by: authData.user?.id || null }),
    };

    const query = editingContent
      ? supabase.from("marketing_content").update(payload).eq("id", editingContent.id)
      : supabase.from("marketing_content").insert(payload);
    const { error } = await query;
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setContentModalOpen(false);
    setEditingContent(null);
    await loadMonth(selectedMonth);
  }

  async function saveAudience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !report) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
      report_id: report.id,
      platform: formText(formData, "platform"),
      canada_pct: formText(formData, "canada_pct")
        ? formNumber(formData, "canada_pct")
        : null,
      gta_pct: formText(formData, "gta_pct")
        ? formNumber(formData, "gta_pct")
        : null,
      target_age_pct: formText(formData, "target_age_pct")
        ? formNumber(formData, "target_age_pct")
        : null,
      female_pct: formText(formData, "female_pct")
        ? formNumber(formData, "female_pct")
        : null,
      male_pct: formText(formData, "male_pct")
        ? formNumber(formData, "male_pct")
        : null,
      vietnamese_pct: formText(formData, "vietnamese_pct")
        ? formNumber(formData, "vietnamese_pct")
        : null,
      notes: formText(formData, "notes") || null,
      ...(editingAudience ? {} : { created_by: authData.user?.id || null }),
    };

    const query = editingAudience
      ? supabase
          .from("marketing_audience_snapshots")
          .update(payload)
          .eq("id", editingAudience.id)
      : supabase.from("marketing_audience_snapshots").insert(payload);
    const { error } = await query;
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setAudienceModalOpen(false);
    setEditingAudience(null);
    await loadMonth(selectedMonth);
  }

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !report) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
      report_id: report.id,
      priority: (formText(formData, "priority") || "medium") as ActionPriority,
      action_item: formText(formData, "action_item"),
      owner_name: formText(formData, "owner_name") || null,
      due_date: formText(formData, "due_date") || null,
      target_kpi: formText(formData, "target_kpi") || null,
      status: (formText(formData, "status") || "not_started") as ActionStatus,
      notes: formText(formData, "notes") || null,
      ...(editingAction ? {} : { created_by: authData.user?.id || null }),
    };

    const query = editingAction
      ? supabase.from("marketing_actions").update(payload).eq("id", editingAction.id)
      : supabase.from("marketing_actions").insert(payload);
    const { error } = await query;
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setActionModalOpen(false);
    setEditingAction(null);
    await loadMonth(selectedMonth);
  }

  async function updateActionStatus(id: string, status: ActionStatus) {
    if (!canEdit) return;
    const { error } = await supabase
      .from("marketing_actions")
      .update({ status })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setActions((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  async function deleteRecord(
    table:
      | "marketing_campaigns"
      | "marketing_content"
      | "marketing_audience_snapshots"
      | "marketing_actions",
    id: string,
  ) {
    if (!canDelete || !window.confirm("Bạn chắc chắn muốn xóa bản ghi này?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadMonth(selectedMonth);
  }


  function escapeHtml(value: unknown) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function chartBars(
    rows: Array<{ label: string; value: number; display?: string }>,
    maxValue?: number,
  ) {
    const max = Math.max(maxValue ?? 0, ...rows.map((row) => row.value), 1);

    return rows
      .map((row) => {
        const width = Math.max(2, Math.min(100, (row.value / max) * 100));
        return `
          <div class="bar-row">
            <div class="bar-label">${escapeHtml(row.label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            <div class="bar-value">${escapeHtml(row.display ?? row.value)}</div>
          </div>`;
      })
      .join("");
  }

  function handleExportMonthlyOverview() {
    if (!report) {
      alert("Vui lòng tạo Báo cáo tháng trước khi export.");
      setActiveTab("reports");
      return;
    }

    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) {
      alert("Trình duyệt đang chặn popup. Vui lòng cho phép popup rồi thử lại.");
      return;
    }

    const funnelChart = chartBars([
      { label: "Leads", value: totals.leads },
      { label: "Demo Booked", value: totals.demoBooked },
      { label: "Demo Attended", value: totals.demoAttended },
      { label: "Customers Won", value: totals.converted },
    ]);

    const sourceChart = chartBars(
      funnelRows.map((row) => ({
        label: row.source,
        value: row.leads,
        display: `${row.leads} leads`,
      })),
    );

    const campaignRoas = [...campaigns]
      .map((row) => {
        const spend = numberValue(row.spend);
        const revenue = numberValue(row.revenue_attributed);
        return {
          label: row.campaign_name,
          value: spend > 0 ? revenue / spend : 0,
          display: spend > 0 ? `${(revenue / spend).toFixed(2)}x` : "0x",
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const campaignRoasChart = chartBars(campaignRoas);

    const campaignMoneyRows = [...campaigns]
      .sort((a, b) => numberValue(b.revenue_attributed) - numberValue(a.revenue_attributed))
      .slice(0, 8);

    const spendVsRevenueChart = campaignMoneyRows
      .map((row) => {
        const spend = numberValue(row.spend);
        const revenue = numberValue(row.revenue_attributed);
        const max = Math.max(spend, revenue, 1);
        return `
          <div class="compare-row">
            <div class="compare-title">${escapeHtml(row.campaign_name)}</div>
            <div class="compare-line"><span>Spend</span><div class="compare-track"><div class="spend" style="width:${Math.max(2, (spend / max) * 100)}%"></div></div><strong>${escapeHtml(formatMoney(spend))}</strong></div>
            <div class="compare-line"><span>Revenue</span><div class="compare-track"><div class="revenue" style="width:${Math.max(2, (revenue / max) * 100)}%"></div></div><strong>${escapeHtml(formatMoney(revenue))}</strong></div>
          </div>`;
      })
      .join("");

    const contentChart = chartBars(
      topContent.map((row) => ({
        label: row.title,
        value: numberValue(row.views),
        display: `${formatNumber(row.views)} views`,
      })),
    );

    const audienceChart = audienceRows
      .map((row) => `
        <div class="audience-card">
          <h4>${escapeHtml(row.platform)}</h4>
          ${chartBars([
            { label: "Canada", value: numberValue(row.canada_pct), display: `${numberValue(row.canada_pct)}%` },
            { label: "GTA", value: numberValue(row.gta_pct), display: `${numberValue(row.gta_pct)}%` },
            { label: "Target age", value: numberValue(row.target_age_pct), display: `${numberValue(row.target_age_pct)}%` },
            { label: "Vietnamese", value: numberValue(row.vietnamese_pct), display: `${numberValue(row.vietnamese_pct)}%` },
          ], 100)}
        </div>`)
      .join("");

    const reportHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FXA Marketing Monthly Overview ${escapeHtml(selectedMonth)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#fff;color:#151515;font-size:12px} .page{max-width:1100px;margin:0 auto;padding:28px}
  .hero{border:2px solid #111;padding:22px;border-radius:18px;background:#fafafa}.brand{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}.hero h1{margin:6px 0 4px;font-size:30px}.muted{color:#666}.status{display:inline-block;padding:5px 9px;border:1px solid #999;border-radius:999px;text-transform:uppercase;font-size:10px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.kpi{border:1px solid #bbb;border-radius:12px;padding:12px}.kpi small{display:block;color:#666;text-transform:uppercase}.kpi strong{display:block;font-size:21px;margin-top:5px}
  .section{margin-top:18px;break-inside:avoid}.section h2{font-size:18px;margin:0 0 10px;border-bottom:2px solid #111;padding-bottom:6px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.box{border:1px solid #bbb;border-radius:12px;padding:14px;break-inside:avoid}
  .bar-row{display:grid;grid-template-columns:130px 1fr 80px;gap:8px;align-items:center;margin:8px 0}.bar-label{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-track,.compare-track{height:13px;background:#ececec;border-radius:999px;overflow:hidden}.bar-fill{height:100%;background:#111}.bar-value{text-align:right;font-weight:700;font-size:11px}
  .compare-row{margin:12px 0;padding-bottom:10px;border-bottom:1px solid #ddd}.compare-title{font-weight:700;margin-bottom:7px}.compare-line{display:grid;grid-template-columns:55px 1fr 90px;gap:8px;align-items:center;margin:5px 0}.compare-line strong{text-align:right;font-size:10px}.spend{height:100%;background:#666}.revenue{height:100%;background:#111}
  table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}th{background:#111;color:#fff}.text-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.text-card{border:1px solid #bbb;border-radius:10px;padding:10px;min-height:90px}.text-card h3{margin:0 0 6px;font-size:12px}.audience-card{margin-bottom:14px}.footer{margin-top:20px;border-top:1px solid #aaa;padding-top:8px;color:#666;font-size:10px}
  @media print{.page{max-width:none;padding:10mm}.no-print{display:none}.section{break-inside:avoid}@page{size:A4 landscape;margin:8mm}}
</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <div class="brand">FXA FITNESS · MARKETING</div>
    <h1>Monthly Marketing Overview — ${escapeHtml(selectedMonth)}</h1>
    <div class="muted">Tổng quan hiệu suất marketing, funnel, campaign, content, audience và kế hoạch hành động.</div>
    <div style="margin-top:10px"><span class="status">${escapeHtml(statusLabel(report.status))}</span></div>
  </div>

  <div class="kpis">
    <div class="kpi"><small>Total Views</small><strong>${escapeHtml(formatNumber(report.views))}</strong></div>
    <div class="kpi"><small>Total Reach</small><strong>${escapeHtml(formatNumber(report.reach))}</strong></div>
    <div class="kpi"><small>Leads</small><strong>${escapeHtml(formatNumber(totals.leads))}</strong></div>
    <div class="kpi"><small>Customers Won</small><strong>${escapeHtml(formatNumber(totals.converted))}</strong></div>
    <div class="kpi"><small>Marketing Spend</small><strong>${escapeHtml(formatMoney(totals.spend))}</strong></div>
    <div class="kpi"><small>Revenue</small><strong>${escapeHtml(formatMoney(totals.revenue))}</strong></div>
    <div class="kpi"><small>CPL / CAC</small><strong>${escapeHtml(formatMoney(totals.cpl))} / ${escapeHtml(formatMoney(totals.cac))}</strong></div>
    <div class="kpi"><small>ROAS / ROI</small><strong>${totals.roas.toFixed(2)}x / ${escapeHtml(formatPercent(totals.roi))}</strong></div>
  </div>

  <section class="section grid2">
    <div class="box"><h2>Marketing Funnel</h2>${funnelChart || '<p class="muted">No funnel data.</p>'}</div>
    <div class="box"><h2>Leads by Source</h2>${sourceChart || '<p class="muted">No lead source data.</p>'}</div>
  </section>

  <section class="section grid2">
    <div class="box"><h2>Campaign Spend vs Revenue</h2>${spendVsRevenueChart || '<p class="muted">No campaign data.</p>'}</div>
    <div class="box"><h2>Campaign ROAS</h2>${campaignRoasChart || '<p class="muted">No ROAS data.</p>'}</div>
  </section>

  <section class="section grid2">
    <div class="box"><h2>Top Content by Views</h2>${contentChart || '<p class="muted">No content data.</p>'}</div>
    <div class="box"><h2>Audience Quality</h2>${audienceChart || '<p class="muted">No audience snapshots.</p>'}</div>
  </section>

  <section class="section box">
    <h2>Campaign Performance</h2>
    <table><thead><tr><th>Campaign</th><th>Channel</th><th>Spend</th><th>Leads</th><th>Won</th><th>Revenue</th><th>CPL</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>
      ${campaigns.map((row) => { const linked=campaignLeadStats.get(row.id); const rowLeads=linked?.leads ?? numberValue(row.leads); const won=linked?.converted ?? numberValue(row.clients_closed); const spend=numberValue(row.spend); const revenue=numberValue(row.revenue_attributed); return `<tr><td>${escapeHtml(row.campaign_name)}</td><td>${escapeHtml(row.platform)}</td><td>${escapeHtml(formatMoney(spend))}</td><td>${rowLeads}</td><td>${won}</td><td>${escapeHtml(formatMoney(revenue))}</td><td>${escapeHtml(formatMoney(rowLeads>0?spend/rowLeads:0))}</td><td>${escapeHtml(formatMoney(won>0?spend/won:0))}</td><td>${spend>0?(revenue/spend).toFixed(2):'0'}x</td></tr>`; }).join('') || '<tr><td colspan="9">No campaigns.</td></tr>'}
    </tbody></table>
  </section>

  <section class="section box">
    <h2>Monthly Review</h2>
    <div class="text-grid">
      <div class="text-card"><h3>Summary</h3><div>${escapeHtml(report.summary || "-")}</div></div>
      <div class="text-card"><h3>Wins</h3><div>${escapeHtml(report.wins || "-")}</div></div>
      <div class="text-card"><h3>Issues</h3><div>${escapeHtml(report.issues || "-")}</div></div>
      <div class="text-card"><h3>Next Steps</h3><div>${escapeHtml(report.next_steps || "-")}</div></div>
    </div>
  </section>

  <section class="section box">
    <h2>Marketing Tasks</h2>
    <table><thead><tr><th>Priority</th><th>Task</th><th>Owner</th><th>Deadline</th><th>KPI</th><th>Status</th></tr></thead><tbody>
      ${actions.map((row) => `<tr><td>${escapeHtml(row.priority)}</td><td>${escapeHtml(row.action_item)}</td><td>${escapeHtml(row.owner_name || "-")}</td><td>${escapeHtml(dateLabel(row.due_date))}</td><td>${escapeHtml(row.target_kpi || "-")}</td><td>${escapeHtml(statusLabel(row.status))}</td></tr>`).join('') || '<tr><td colspan="6">No marketing tasks.</td></tr>'}
    </tbody></table>
  </section>

  <div class="footer">Generated from FXA FITNESS Marketing Workspace · ${new Date().toLocaleString("en-CA")}</div>
  <div class="no-print" style="margin-top:18px"><button onclick="window.print()" style="padding:10px 16px;border:0;border-radius:8px;background:#111;color:white;font-weight:700;cursor:pointer">Print / Save PDF</button></div>
</div>
</body></html>`;

    popup.document.open();
    popup.document.write(reportHtml);
    popup.document.close();
    popup.focus();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function requireReport() {
    if (report) return true;
    alert("Vui lòng tạo Báo cáo tháng trước khi thêm Campaign, Content, Audience hoặc Tác vụ.");
    setActiveTab("reports");
    return false;
  }

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Checking marketing access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070707] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[96rem]">
        <header className="rounded-3xl border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.13),_transparent_38%),#0b0b0b] p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-medium uppercase tracking-[0.32em] text-yellow-400">
                FXA FITNESS · MARKETING WORKSPACE
              </p>
              <h1 className="mt-2 text-4xl font-semibold md:text-6xl">
                Marketing Admin Workspace
              </h1>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Làm việc theo thứ tự: 1) tạo báo cáo tháng, 2) tạo campaign, 3) lên content và lịch đăng, 4) theo dõi lead/demo, 5) cập nhật kết quả, 6) chốt báo cáo và tác vụ tháng tiếp theo.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-medium uppercase text-zinc-300">
                {roleLabel(role)}
              </span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="rounded-xl border border-yellow-400/30 bg-black px-4 py-2 text-sm text-yellow-300"
              />
              <button
                type="button"
                onClick={handleExportMonthlyOverview}
                disabled={!report || loading}
                className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                title={!report ? "Tạo Monthly Report trước khi export" : "Export báo cáo tổng quan tháng"}
              >
                Export Monthly Overview
              </button>
              <Link
                href="/admin/leads"
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20"
              >
                Lead Management
              </Link>
              {role !== "marketing_manager" ? (
                <Link
                  href="/admin"
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-yellow-400/40 hover:text-yellow-300"
                >
                  Admin Dashboard
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400 hover:text-black"
              >
                Sign Out
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {[
              ["1", "Tạo báo cáo tháng", "Bắt buộc trước khi thêm dữ liệu marketing"],
              ["2", "Campaign", "Nhập ngân sách, clicks, leads, revenue"],
              ["3", "Content & Calendar", "Lập nội dung và ngày đăng"],
              ["4", "Leads & Demo", "Theo dõi lead từ nguồn đến converted"],
              ["5", "Audience & KPI", "Đánh giá chất lượng tệp và hiệu quả"],
              ["6", "Report & Actions", "Chốt tháng và giao việc tiếp theo"],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-black">{step}</div>
                <p className="mt-3 text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
              </div>
            ))}
          </div>

          {!report ? (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-amber-200">Bắt đầu tháng này bằng Báo cáo tháng</p>
                <p className="mt-1 text-sm text-amber-100/70">Bạn cần tạo report trước khi thêm Campaign, Content, Audience hoặc Tác vụ.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("reports")}
                className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-200"
              >
                Tạo Báo cáo tháng
              </button>
            </div>
          ) : null}
        </header>

        <nav className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                activeTab === tab.id
                  ? "border-yellow-400 bg-yellow-400 text-black"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-yellow-400/30"
              }`}
            >
              <p className="text-sm font-semibold">{tab.label}</p>
              <p className={`mt-1 text-[11px] ${activeTab === tab.id ? "text-black/60" : "text-zinc-600"}`}>
                {tab.description}
              </p>
            </button>
          ))}
        </nav>

        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Kênh Marketing">
              <select
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value)}
                className={inputClass()}
              >
                {CHANNELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Organic / Paid">
              <select
                value={distributionFilter}
                onChange={(event) => setDistributionFilter(event.target.value)}
                className={inputClass()}
              >
                <option value="all">Tất cả</option>
                <option value="organic">Organic</option>
                <option value="paid">Paid</option>
                <option value="mixed">Mixed</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Tìm kiếm">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Tìm campaign, content, mục tiêu..."
                  className={inputClass()}
                />
              </Field>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-16 text-center text-yellow-400">
            Loading marketing data...
          </div>
        ) : (
          <>
            {activeTab === "overview" ? (
              <div className="mt-6 space-y-6">
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                  <KpiCard label="Total Views" value={formatNumber(report?.views)} detail="Báo cáo tháng" />
                  <KpiCard label="Total Reach" value={formatNumber(report?.reach)} detail="Báo cáo tháng" />
                  <KpiCard label="Interactions" value={formatNumber(report?.interactions)} detail="Tương tác nội dung" />
                  <KpiCard label="Link Clicks" value={formatNumber(report?.link_clicks)} detail="Hành động về website" />
                  <KpiCard label="New Leads" value={formatNumber(totals.leads)} detail="Live từ bảng leads" />
                  <KpiCard label="Customers Won" value={formatNumber(totals.converted)} detail={`Close rate ${formatPercent(totals.closeRate)}`} />
                  <KpiCard label="Revenue" value={formatMoney(totals.revenue)} detail={`ROAS ${totals.roas.toFixed(2)}×`} />
                  <KpiCard label="Marketing Spend" value={formatMoney(totals.spend)} detail={`CPL ${formatMoney(totals.cpl)}`} />
                </section>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Lead Conversion" value={formatPercent(totals.closeRate)} detail="Won ÷ Leads" />
                  <KpiCard label="Demo Show Rate" value={formatPercent(totals.showRate)} detail={`${totals.demoAttended}/${totals.demoBooked} attended`} />
                  <KpiCard label="CAC" value={formatMoney(totals.cac)} detail="Spend ÷ Customers Won" />
                  <KpiCard label="Marketing ROI" value={formatPercent(totals.roi)} detail="(Revenue - Spend) ÷ Spend" />
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Marketing Funnel</p>
                        <h2 className="mt-1 text-2xl font-semibold">Lead theo nguồn</h2>
                      </div>
                      <Link href="/admin/leads" className="text-sm text-yellow-300">Xem Leads →</Link>
                    </div>
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                          <tr className="bg-yellow-400 text-black">
                            <th className="px-4 py-3">Nguồn</th>
                            <th className="px-4 py-3">Leads</th>
                            <th className="px-4 py-3">Contacted</th>
                            <th className="px-4 py-3">Demo</th>
                            <th className="px-4 py-3">Attended</th>
                            <th className="px-4 py-3">Won</th>
                            <th className="px-4 py-3">Conversion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {funnelRows.map((row) => (
                            <tr key={row.source} className="border-b border-white/10">
                              <td className="px-4 py-3 font-medium">{row.source}</td>
                              <td className="px-4 py-3">{row.leads}</td>
                              <td className="px-4 py-3">{row.contacted}</td>
                              <td className="px-4 py-3">{row.demoBooked}</td>
                              <td className="px-4 py-3">{row.demoAttended}</td>
                              <td className="px-4 py-3 text-green-300">{row.converted}</td>
                              <td className="px-4 py-3">{formatPercent(safeRate(row.converted, row.leads))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {funnelRows.length === 0 ? <p className="py-8 text-center text-zinc-500">Chưa có lead trong tháng này.</p> : null}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                      <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Follow-up</p>
                      <h2 className="mt-1 text-xl font-semibold">Lead cần xử lý</h2>
                      <div className="mt-4 space-y-2">
                        {followUpLeads.slice(0, 6).map((lead) => (
                          <div key={lead.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                            <p className="font-medium">{lead.full_name || "Unnamed Lead"}</p>
                            <p className="mt-1 text-xs text-zinc-500">{sourceLabel(lead.source_type, lead.source_detail)} · {statusLabel(String(lead.status || "new"))}</p>
                          </div>
                        ))}
                        {followUpLeads.length === 0 ? <p className="text-sm text-zinc-500">Không có lead cần follow-up.</p> : null}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                      <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Upcoming Content</p>
                      <h2 className="mt-1 text-xl font-semibold">Sắp đăng</h2>
                      <div className="mt-4 space-y-2">
                        {upcomingContent.map((row) => (
                          <button key={row.id} type="button" onClick={() => { setEditingContent(row); setContentModalOpen(true); }} className="block w-full rounded-xl border border-white/10 bg-black/30 p-3 text-left hover:border-yellow-400/30">
                            <p className="font-medium">{row.title}</p>
                            <p className="mt-1 text-xs text-zinc-500">{dateLabel(row.publish_date)} · {row.platform}</p>
                          </button>
                        ))}
                        {upcomingContent.length === 0 ? <p className="text-sm text-zinc-500">Chưa có nội dung sắp đăng.</p> : null}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Top Performing Content</p>
                      <h2 className="mt-1 text-2xl font-semibold">Nội dung nổi bật</h2>
                    </div>
                    <button type="button" onClick={() => setActiveTab("content")} className="text-sm text-yellow-300">Xem tất cả →</button>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {topContent.map((row) => {
                      const linked = contentLeadStats.get(row.id);
                      return (
                        <div key={row.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs uppercase text-zinc-500">{row.platform} · {row.distribution}</p>
                          <h3 className="mt-2 line-clamp-2 font-medium">{row.title}</h3>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                            <span>Views: {formatNumber(row.views)}</span>
                            <span>Leads: {formatNumber(linked?.leads ?? row.leads)}</span>
                            <span>Sales: {formatNumber(linked?.converted ?? row.clients_closed)}</span>
                            <span>Revenue: {formatMoney(row.revenue_attributed)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "campaigns" ? (
              <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Campaign Management</p>
                    <h2 className="mt-1 text-2xl font-semibold">Chiến dịch Marketing</h2>
                    <p className="mt-2 text-sm text-zinc-500">Theo dõi spend, leads, khách chốt, CPL, CAC và ROAS.</p>
                  </div>
                  {canEdit ? (
                    <PrimaryButton onClick={() => {
                      if (!requireReport()) return;
                      setEditingCampaign(null);
                      setCampaignModalOpen(true);
                    }}>
                      + Thêm Campaign
                    </PrimaryButton>
                  ) : null}
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[1250px] text-left text-sm">
                    <thead>
                      <tr className="bg-yellow-400 text-black">
                        <th className="px-4 py-3">Campaign</th>
                        <th className="px-4 py-3">Kênh</th>
                        <th className="px-4 py-3">Mục tiêu</th>
                        <th className="px-4 py-3">Spend</th>
                        <th className="px-4 py-3">Clicks</th>
                        <th className="px-4 py-3">Leads</th>
                        <th className="px-4 py-3">Won</th>
                        <th className="px-4 py-3">Revenue</th>
                        <th className="px-4 py-3">CPL</th>
                        <th className="px-4 py-3">CAC</th>
                        <th className="px-4 py-3">ROAS</th>
                        <th className="px-4 py-3">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCampaigns.map((row) => {
                        const linked = campaignLeadStats.get(row.id);
                        const rowLeads = linked?.leads ?? numberValue(row.leads);
                        const closed = linked?.converted ?? numberValue(row.clients_closed);
                        const spend = numberValue(row.spend);
                        const revenue = numberValue(row.revenue_attributed);
                        return (
                          <tr key={row.id} className="border-b border-white/10 align-top">
                            <td className="px-4 py-3 font-medium">{row.campaign_name}</td>
                            <td className="px-4 py-3">{row.platform}</td>
                            <td className="max-w-[260px] px-4 py-3 text-zinc-400">{row.objective || "-"}</td>
                            <td className="px-4 py-3">{formatMoney(spend)}</td>
                            <td className="px-4 py-3">{formatNumber(row.clicks)}</td>
                            <td className="px-4 py-3">{formatNumber(rowLeads)}</td>
                            <td className="px-4 py-3">{formatNumber(closed)}</td>
                            <td className="px-4 py-3 text-green-300">{formatMoney(revenue)}</td>
                            <td className="px-4 py-3">{formatMoney(rowLeads > 0 ? spend / rowLeads : 0)}</td>
                            <td className="px-4 py-3">{formatMoney(closed > 0 ? spend / closed : 0)}</td>
                            <td className="px-4 py-3">{spend > 0 ? `${(revenue / spend).toFixed(2)}×` : "0×"}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {canEdit ? <SecondaryButton onClick={() => { setEditingCampaign(row); setCampaignModalOpen(true); }}>Sửa</SecondaryButton> : null}
                                {canDelete ? <SecondaryButton danger onClick={() => void deleteRecord("marketing_campaigns", row.id)}>Xóa</SecondaryButton> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredCampaigns.length === 0 ? <p className="py-10 text-center text-zinc-500">Không có campaign phù hợp bộ lọc.</p> : null}
                </div>
              </section>
            ) : null}

            {activeTab === "content" ? (
              <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Content Management</p>
                    <h2 className="mt-1 text-2xl font-semibold">Hiệu suất nội dung</h2>
                    <p className="mt-2 text-sm text-zinc-500">Mỗi bài đăng là một bản ghi riêng để đo views, leads và revenue.</p>
                  </div>
                  {canEdit ? (
                    <PrimaryButton onClick={() => {
                      if (!requireReport()) return;
                      setEditingContent(null);
                      setContentModalOpen(true);
                    }}>
                      + Thêm Nội dung
                    </PrimaryButton>
                  ) : null}
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[1450px] text-left text-sm">
                    <thead>
                      <tr className="bg-yellow-400 text-black">
                        <th className="px-4 py-3">Ngày đăng</th>
                        <th className="px-4 py-3">Tiêu đề nội dung</th>
                        <th className="px-4 py-3">Kênh</th>
                        <th className="px-4 py-3">Pillar</th>
                        <th className="px-4 py-3">Loại</th>
                        <th className="px-4 py-3">Views</th>
                        <th className="px-4 py-3">Reach</th>
                        <th className="px-4 py-3">Engagement</th>
                        <th className="px-4 py-3">Leads</th>
                        <th className="px-4 py-3">Won</th>
                        <th className="px-4 py-3">Revenue</th>
                        <th className="px-4 py-3">Conversion</th>
                        <th className="px-4 py-3">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContent.map((row) => {
                        const linked = contentLeadStats.get(row.id);
                        const rowLeads = linked?.leads ?? numberValue(row.leads);
                        const won = linked?.converted ?? numberValue(row.clients_closed);
                        return (
                          <tr key={row.id} className="border-b border-white/10 align-top">
                            <td className="px-4 py-3">{dateLabel(row.publish_date)}</td>
                            <td className="max-w-[300px] px-4 py-3 font-medium">
                              {row.post_url ? <a href={row.post_url} target="_blank" rel="noreferrer" className="hover:text-yellow-300">{row.title}</a> : row.title}
                            </td>
                            <td className="px-4 py-3">{row.platform}</td>
                            <td className="px-4 py-3">{row.pillar || "-"}</td>
                            <td className="px-4 py-3 uppercase">{row.distribution}</td>
                            <td className="px-4 py-3">{formatNumber(row.views)}</td>
                            <td className="px-4 py-3">{formatNumber(row.reach)}</td>
                            <td className="px-4 py-3">{formatNumber(row.interactions)}</td>
                            <td className="px-4 py-3">{formatNumber(rowLeads)}</td>
                            <td className="px-4 py-3">{formatNumber(won)}</td>
                            <td className="px-4 py-3 text-green-300">{formatMoney(row.revenue_attributed)}</td>
                            <td className="px-4 py-3">{formatPercent(safeRate(won, rowLeads))}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {canEdit ? <SecondaryButton onClick={() => { setEditingContent(row); setContentModalOpen(true); }}>Sửa</SecondaryButton> : null}
                                {canDelete ? <SecondaryButton danger onClick={() => void deleteRecord("marketing_content", row.id)}>Xóa</SecondaryButton> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredContent.length === 0 ? <p className="py-10 text-center text-zinc-500">Không có content phù hợp bộ lọc.</p> : null}
                </div>
              </section>
            ) : null}

            {activeTab === "calendar" ? (
              <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Content Calendar</p>
                    <h2 className="mt-1 text-2xl font-semibold">Lịch đăng nội dung</h2>
                    <p className="mt-2 text-sm text-zinc-500">Chọn một nội dung để mở nhanh phần chỉnh sửa.</p>
                  </div>
                  {canEdit ? (
                    <PrimaryButton onClick={() => {
                      if (!requireReport()) return;
                      setEditingContent(null);
                      setContentModalOpen(true);
                    }}>
                      + Thêm vào lịch
                    </PrimaryButton>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[...filteredContent]
                    .sort((a, b) => a.publish_date.localeCompare(b.publish_date))
                    .map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingContent(row);
                          setContentModalOpen(true);
                        }}
                        className="rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition hover:border-yellow-400/35"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-xs text-yellow-300">{dateLabel(row.publish_date)}</span>
                          <span className="text-xs uppercase text-zinc-500">{row.distribution}</span>
                        </div>
                        <h3 className="mt-3 font-medium">{row.title}</h3>
                        <p className="mt-2 text-sm text-zinc-500">{row.platform} · {row.pillar || "No pillar"}</p>
                        {canEdit ? <p className="mt-4 text-xs text-yellow-300">Nhấn để sửa</p> : null}
                      </button>
                    ))}
                </div>
                {filteredContent.length === 0 ? <p className="py-12 text-center text-zinc-500">Chưa có nội dung trong lịch.</p> : null}
              </section>
            ) : null}

            {activeTab === "audience" ? (
              <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Audience Analytics</p>
                    <h2 className="mt-1 text-2xl font-semibold">Chất lượng tệp khách hàng</h2>
                    <p className="mt-2 text-sm text-zinc-500">Ưu tiên Canada, GTA, nhóm tuổi mục tiêu và khách hàng có thể đến phòng gym.</p>
                  </div>
                  {canEdit ? (
                    <PrimaryButton onClick={() => {
                      if (!requireReport()) return;
                      setEditingAudience(null);
                      setAudienceModalOpen(true);
                    }}>
                      + Thêm Audience
                    </PrimaryButton>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {audienceRows.map((row) => {
                    const localWarning = numberValue(row.gta_pct) < 25 && numberValue(row.canada_pct) < 50;
                    return (
                      <div key={row.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-zinc-500">Platform</p>
                            <h3 className="mt-1 text-xl font-semibold text-yellow-300">{row.platform}</h3>
                          </div>
                          <div className="flex gap-2">
                            {canEdit ? <SecondaryButton onClick={() => { setEditingAudience(row); setAudienceModalOpen(true); }}>Sửa</SecondaryButton> : null}
                            {canDelete ? <SecondaryButton danger onClick={() => void deleteRecord("marketing_audience_snapshots", row.id)}>Xóa</SecondaryButton> : null}
                          </div>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                          <p>Canada<br /><strong>{row.canada_pct ?? "-"}%</strong></p>
                          <p>GTA<br /><strong>{row.gta_pct ?? "-"}%</strong></p>
                          <p>Target age<br /><strong>{row.target_age_pct ?? "-"}%</strong></p>
                          <p>Female<br /><strong>{row.female_pct ?? "-"}%</strong></p>
                          <p>Male<br /><strong>{row.male_pct ?? "-"}%</strong></p>
                          <p>Vietnamese<br /><strong>{row.vietnamese_pct ?? "-"}%</strong></p>
                        </div>
                        {localWarning ? <div className="mt-4 rounded-xl border border-orange-400/25 bg-orange-400/10 p-3 text-xs text-orange-200">Cảnh báo: tỷ lệ local audience đang thấp. Hãy kiểm tra geo target và nội dung.</div> : null}
                        {row.notes ? <p className="mt-4 text-sm leading-6 text-zinc-400">{row.notes}</p> : null}
                      </div>
                    );
                  })}
                </div>
                {audienceRows.length === 0 ? <p className="py-12 text-center text-zinc-500">Chưa có audience snapshot.</p> : null}
              </section>
            ) : null}

            {activeTab === "reports" ? (
              <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Monthly Report</p>
                    <h2 className="mt-1 text-2xl font-semibold">Báo cáo tháng {selectedMonth}</h2>
                    <p className="mt-2 text-sm text-zinc-500">Điền đủ KPI, kết luận, vấn đề và kế hoạch tháng tiếp theo.</p>
                  </div>
                  <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs uppercase text-yellow-300">{report ? statusLabel(report.status) : "not created"}</span>
                </div>

                {canEdit ? (
                  <form key={`${selectedMonth}-${report?.id || "new"}`} onSubmit={saveReport} className="mt-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Trạng thái báo cáo" required>
                        <select name="status" defaultValue={report?.status || "draft"} className={inputClass()}>
                          {REPORT_STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
                        </select>
                      </Field>
                      <Field label="Tổng lượt xem"><input name="views" type="number" min="0" defaultValue={numberValue(report?.views)} className={inputClass()} /></Field>
                      <Field label="Tổng Reach"><input name="reach" type="number" min="0" defaultValue={numberValue(report?.reach)} className={inputClass()} /></Field>
                      <Field label="Content Interactions"><input name="interactions" type="number" min="0" defaultValue={numberValue(report?.interactions)} className={inputClass()} /></Field>
                      <Field label="Link Clicks"><input name="link_clicks" type="number" min="0" defaultValue={numberValue(report?.link_clicks)} className={inputClass()} /></Field>
                      <Field label="Follower tăng"><input name="followers_gained" type="number" defaultValue={numberValue(report?.followers_gained)} className={inputClass()} /></Field>
                      <Field label="Marketing Spend CAD"><input name="ad_spend" type="number" min="0" step="0.01" defaultValue={numberValue(report?.ad_spend)} className={inputClass()} /></Field>
                      <Field label="Revenue quy gán CAD"><input name="revenue_attributed" type="number" min="0" step="0.01" defaultValue={numberValue(report?.revenue_attributed)} className={inputClass()} /></Field>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <Field label="Tóm tắt điều hành"><textarea name="summary" defaultValue={report?.summary || ""} className={`${inputClass()} min-h-32`} placeholder="Kết quả chính của tháng..." /></Field>
                      <Field label="Điểm làm tốt"><textarea name="wins" defaultValue={report?.wins || ""} className={`${inputClass()} min-h-32`} placeholder="Campaign, content hoặc kênh hoạt động tốt..." /></Field>
                      <Field label="Vấn đề / dữ liệu thiếu"><textarea name="issues" defaultValue={report?.issues || ""} className={`${inputClass()} min-h-32`} placeholder="Các vấn đề cần xử lý..." /></Field>
                      <Field label="Kế hoạch tháng tiếp theo"><textarea name="next_steps" defaultValue={report?.next_steps || ""} className={`${inputClass()} min-h-32`} placeholder="Ưu tiên, owner và KPI..." /></Field>
                    </div>
                    <div className="mt-5 flex justify-end">
                      <PrimaryButton type="submit" disabled={saving}>{saving ? "Đang lưu..." : report ? "Lưu chỉnh sửa báo cáo" : "Tạo báo cáo tháng"}</PrimaryButton>
                    </div>
                  </form>
                ) : null}
              </section>
            ) : null}

            {activeTab === "actions" ? (
              <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-yellow-400">Marketing Tasks</p>
                    <h2 className="mt-1 text-2xl font-semibold">Tác vụ, owner và deadline</h2>
                    <p className="mt-2 text-sm text-zinc-500">Theo dõi công việc từ ý tưởng đến hoàn thành, kèm KPI rõ ràng.</p>
                  </div>
                  {canEdit ? (
                    <PrimaryButton onClick={() => {
                      if (!requireReport()) return;
                      setEditingAction(null);
                      setActionModalOpen(true);
                    }}>
                      + Thêm Tác vụ
                    </PrimaryButton>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {actions.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase ${row.priority === "high" ? "border-red-400/30 bg-red-400/10 text-red-300" : row.priority === "medium" ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300" : "border-sky-400/30 bg-sky-400/10 text-sky-300"}`}>{row.priority}</span>
                            <span className="text-xs text-zinc-500">Deadline {dateLabel(row.due_date)}</span>
                          </div>
                          <h3 className="mt-3 text-lg font-medium">{row.action_item}</h3>
                          <p className="mt-2 text-sm text-zinc-400">Owner: {row.owner_name || "Chưa giao"}</p>
                          {row.target_kpi ? <p className="mt-1 text-sm text-yellow-200">KPI: {row.target_kpi}</p> : null}
                          {row.notes ? <p className="mt-3 text-sm leading-6 text-zinc-500">{row.notes}</p> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canEdit ? (
                            <select value={row.status} onChange={(event) => void updateActionStatus(row.id, event.target.value as ActionStatus)} className="rounded-xl border border-white/15 bg-white px-3 py-2 text-xs text-black">
                              {ACTION_STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
                            </select>
                          ) : null}
                          {canEdit ? <SecondaryButton onClick={() => { setEditingAction(row); setActionModalOpen(true); }}>Sửa</SecondaryButton> : null}
                          {canDelete ? <SecondaryButton danger onClick={() => void deleteRecord("marketing_actions", row.id)}>Xóa</SecondaryButton> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {actions.length === 0 ? <p className="py-12 text-center text-zinc-500">Chưa có tác vụ marketing.</p> : null}
              </section>
            ) : null}
          </>
        )}
      </div>

      {campaignModalOpen ? (
        <ModalShell
          title={editingCampaign ? "Chỉnh sửa Campaign" : "Thêm Campaign mới"}
          subtitle="Nhập đầy đủ chi phí, kết quả và doanh thu quy gán."
          onClose={() => { setCampaignModalOpen(false); setEditingCampaign(null); }}
        >
          <form onSubmit={saveCampaign} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Tên Campaign" required><input name="campaign_name" required defaultValue={editingCampaign?.campaign_name || ""} className={inputClass()} /></Field>
            <Field label="Kênh" required><select name="platform" required defaultValue={editingCampaign?.platform || "Facebook"} className={inputClass()}>{CHANNELS.filter((item) => item !== "All").map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <div className="md:col-span-2"><Field label="Mục tiêu Campaign" required><input name="objective" required defaultValue={editingCampaign?.objective || ""} placeholder="Ví dụ: Tạo lead cho 8 Weeks Challenge" className={inputClass()} /></Field></div>
            <Field label="Spend CAD"><input name="spend" type="number" min="0" step="0.01" defaultValue={numberValue(editingCampaign?.spend)} className={inputClass()} /></Field>
            <Field label="Impressions"><input name="impressions" type="number" min="0" defaultValue={numberValue(editingCampaign?.impressions)} className={inputClass()} /></Field>
            <Field label="Reach"><input name="reach" type="number" min="0" defaultValue={numberValue(editingCampaign?.reach)} className={inputClass()} /></Field>
            <Field label="Clicks"><input name="clicks" type="number" min="0" defaultValue={numberValue(editingCampaign?.clicks)} className={inputClass()} /></Field>
            <Field label="Leads thủ công"><input name="leads" type="number" min="0" defaultValue={numberValue(editingCampaign?.leads)} className={inputClass()} /></Field>
            <Field label="Demo Booked"><input name="demo_booked" type="number" min="0" defaultValue={numberValue(editingCampaign?.demo_booked)} className={inputClass()} /></Field>
            <Field label="Demo Attended"><input name="demo_attended" type="number" min="0" defaultValue={numberValue(editingCampaign?.demo_attended)} className={inputClass()} /></Field>
            <Field label="Customers Won"><input name="clients_closed" type="number" min="0" defaultValue={numberValue(editingCampaign?.clients_closed)} className={inputClass()} /></Field>
            <Field label="Revenue CAD"><input name="revenue_attributed" type="number" min="0" step="0.01" defaultValue={numberValue(editingCampaign?.revenue_attributed)} className={inputClass()} /></Field>
            <div className="md:col-span-2 xl:col-span-4"><Field label="Ghi chú"><textarea name="notes" defaultValue={editingCampaign?.notes || ""} className={`${inputClass()} min-h-24`} /></Field></div>
            <div className="flex justify-end gap-3 md:col-span-2 xl:col-span-4">
              <SecondaryButton onClick={() => { setCampaignModalOpen(false); setEditingCampaign(null); }}>Hủy</SecondaryButton>
              <PrimaryButton type="submit" disabled={saving}>{saving ? "Đang lưu..." : editingCampaign ? "Lưu chỉnh sửa" : "Thêm Campaign"}</PrimaryButton>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {contentModalOpen ? (
        <ModalShell
          title={editingContent ? "Chỉnh sửa Nội dung" : "Thêm Nội dung mới"}
          subtitle="Ghi rõ tiêu đề, kênh, pillar, mục tiêu và hiệu suất."
          onClose={() => { setContentModalOpen(false); setEditingContent(null); }}
        >
          <form onSubmit={saveContent} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2"><Field label="Tiêu đề nội dung" required><input name="title" required defaultValue={editingContent?.title || ""} placeholder="Ví dụ: 8 Weeks Transformation Story" className={inputClass()} /></Field></div>
            <Field label="Ngày đăng" required><input name="publish_date" type="date" required defaultValue={editingContent?.publish_date || `${selectedMonth}-01`} className={inputClass()} /></Field>
            <Field label="Kênh" required><select name="platform" required defaultValue={editingContent?.platform || "Instagram"} className={inputClass()}>{CHANNELS.filter((item) => item !== "All").map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <Field label="Content Pillar" required><select name="pillar" required defaultValue={editingContent?.pillar || "Education"} className={inputClass()}>{CONTENT_PILLARS.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <Field label="Organic / Paid" required><select name="distribution" required defaultValue={editingContent?.distribution || "organic"} className={inputClass()}><option value="organic">Organic</option><option value="paid">Paid</option><option value="mixed">Mixed</option></select></Field>
            <div className="md:col-span-2"><Field label="Mục tiêu nội dung"><input name="objective" defaultValue={editingContent?.objective || ""} placeholder="Awareness, engagement, lead hoặc conversion" className={inputClass()} /></Field></div>
            <Field label="Views"><input name="views" type="number" min="0" defaultValue={numberValue(editingContent?.views)} className={inputClass()} /></Field>
            <Field label="Reach"><input name="reach" type="number" min="0" defaultValue={numberValue(editingContent?.reach)} className={inputClass()} /></Field>
            <Field label="Interactions"><input name="interactions" type="number" min="0" defaultValue={numberValue(editingContent?.interactions)} className={inputClass()} /></Field>
            <Field label="Saves"><input name="saves" type="number" min="0" defaultValue={numberValue(editingContent?.saves)} className={inputClass()} /></Field>
            <Field label="Shares"><input name="shares" type="number" min="0" defaultValue={numberValue(editingContent?.shares)} className={inputClass()} /></Field>
            <Field label="Messages / DMs"><input name="dms" type="number" min="0" defaultValue={numberValue(editingContent?.dms)} className={inputClass()} /></Field>
            <Field label="Leads thủ công"><input name="leads" type="number" min="0" defaultValue={numberValue(editingContent?.leads)} className={inputClass()} /></Field>
            <Field label="Customers Won"><input name="clients_closed" type="number" min="0" defaultValue={numberValue(editingContent?.clients_closed)} className={inputClass()} /></Field>
            <Field label="Revenue CAD"><input name="revenue_attributed" type="number" min="0" step="0.01" defaultValue={numberValue(editingContent?.revenue_attributed)} className={inputClass()} /></Field>
            <div className="md:col-span-2 xl:col-span-3"><Field label="Post URL"><input name="post_url" type="url" defaultValue={editingContent?.post_url || ""} placeholder="https://..." className={inputClass()} /></Field></div>
            <div className="md:col-span-2 xl:col-span-4"><Field label="Ghi chú / bài học"><textarea name="notes" defaultValue={editingContent?.notes || ""} className={`${inputClass()} min-h-24`} placeholder="Hook nào hiệu quả, CTA nào cần cải thiện..." /></Field></div>
            <div className="flex justify-end gap-3 md:col-span-2 xl:col-span-4">
              <SecondaryButton onClick={() => { setContentModalOpen(false); setEditingContent(null); }}>Hủy</SecondaryButton>
              <PrimaryButton type="submit" disabled={saving}>{saving ? "Đang lưu..." : editingContent ? "Lưu chỉnh sửa" : "Thêm Nội dung"}</PrimaryButton>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {audienceModalOpen ? (
        <ModalShell
          title={editingAudience ? "Chỉnh sửa Audience" : "Thêm Audience Snapshot"}
          subtitle="Theo dõi chất lượng tệp local theo từng nền tảng."
          onClose={() => { setAudienceModalOpen(false); setEditingAudience(null); }}
        >
          <form onSubmit={saveAudience} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Platform" required><select name="platform" required defaultValue={editingAudience?.platform || "Instagram"} className={inputClass()}>{CHANNELS.filter((item) => item !== "All").map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            <Field label="Canada %"><input name="canada_pct" type="number" min="0" max="100" step="0.01" defaultValue={editingAudience?.canada_pct ?? ""} className={inputClass()} /></Field>
            <Field label="GTA %"><input name="gta_pct" type="number" min="0" max="100" step="0.01" defaultValue={editingAudience?.gta_pct ?? ""} className={inputClass()} /></Field>
            <Field label="Target age %"><input name="target_age_pct" type="number" min="0" max="100" step="0.01" defaultValue={editingAudience?.target_age_pct ?? ""} className={inputClass()} /></Field>
            <Field label="Female %"><input name="female_pct" type="number" min="0" max="100" step="0.01" defaultValue={editingAudience?.female_pct ?? ""} className={inputClass()} /></Field>
            <Field label="Male %"><input name="male_pct" type="number" min="0" max="100" step="0.01" defaultValue={editingAudience?.male_pct ?? ""} className={inputClass()} /></Field>
            <Field label="Vietnamese audience %"><input name="vietnamese_pct" type="number" min="0" max="100" step="0.01" defaultValue={editingAudience?.vietnamese_pct ?? ""} className={inputClass()} /></Field>
            <div className="md:col-span-2 xl:col-span-3"><Field label="Ghi chú"><textarea name="notes" defaultValue={editingAudience?.notes || ""} className={`${inputClass()} min-h-24`} /></Field></div>
            <div className="flex justify-end gap-3 md:col-span-2 xl:col-span-3">
              <SecondaryButton onClick={() => { setAudienceModalOpen(false); setEditingAudience(null); }}>Hủy</SecondaryButton>
              <PrimaryButton type="submit" disabled={saving}>{saving ? "Đang lưu..." : editingAudience ? "Lưu chỉnh sửa" : "Thêm Audience"}</PrimaryButton>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {actionModalOpen ? (
        <ModalShell
          title={editingAction ? "Chỉnh sửa Tác vụ" : "Thêm Tác vụ Marketing"}
          subtitle="Mỗi tác vụ cần owner, deadline và KPI rõ ràng."
          onClose={() => { setActionModalOpen(false); setEditingAction(null); }}
        >
          <form onSubmit={saveAction} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Tiêu đề tác vụ" required><input name="action_item" required defaultValue={editingAction?.action_item || ""} placeholder="Ví dụ: Hoàn thiện Meta Ads report tuần 2" className={inputClass()} /></Field></div>
            <Field label="Người phụ trách"><input name="owner_name" defaultValue={editingAction?.owner_name || ""} placeholder="Tên Marketing Staff" className={inputClass()} /></Field>
            <Field label="Deadline"><input name="due_date" type="date" defaultValue={editingAction?.due_date || ""} className={inputClass()} /></Field>
            <Field label="Priority"><select name="priority" defaultValue={editingAction?.priority || "medium"} className={inputClass()}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
            <Field label="Status"><select name="status" defaultValue={editingAction?.status || "not_started"} className={inputClass()}>{ACTION_STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></Field>
            <div className="md:col-span-2"><Field label="KPI mục tiêu"><input name="target_kpi" defaultValue={editingAction?.target_kpi || ""} placeholder="Ví dụ: 30 leads, CPL dưới $20" className={inputClass()} /></Field></div>
            <div className="md:col-span-2"><Field label="Mô tả / ghi chú"><textarea name="notes" defaultValue={editingAction?.notes || ""} className={`${inputClass()} min-h-24`} /></Field></div>
            <div className="flex justify-end gap-3 md:col-span-2">
              <SecondaryButton onClick={() => { setActionModalOpen(false); setEditingAction(null); }}>Hủy</SecondaryButton>
              <PrimaryButton type="submit" disabled={saving}>{saving ? "Đang lưu..." : editingAction ? "Lưu chỉnh sửa" : "Thêm Tác vụ"}</PrimaryButton>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </main>
  );
}
