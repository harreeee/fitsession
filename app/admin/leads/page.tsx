"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type LeadStatus =
  | "new"
  | "contacted"
  | "demo_booked"
  | "demo_completed"
  | "no_show"
  | "interested"
  | "follow_up"
  | "converted"
  | "lost";

type LeadSource =
  | "walk_in"
  | "referral"
  | "facebook"
  | "instagram"
  | "google"
  | "other_marketing"
  | "other";

type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source_type: LeadSource;
  source_detail: string | null;
  status: LeadStatus;
  demo_at: string | null;
  assigned_trainer_id: string | null;
  marketing_campaign_id: string | null;
  marketing_content_id: string | null;
  notes: string | null;
  demo_result_note: string | null;
  converted_client_id: string | null;
  created_at: string;
};

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type MarketingCampaignOption = {
  id: string;
  campaign_name: string;
  platform: string;
  created_at: string;
};

type MarketingContentOption = {
  id: string;
  title: string;
  platform: string;
  publish_date: string;
};

type LeadEditDraft = {
  full_name: string;
  email: string;
  phone: string;
  source_type: LeadSource;
  source_detail: string;
  status: LeadStatus;
  demo_at: string;
  assigned_trainer_id: string;
  marketing_campaign_id: string;
  marketing_content_id: string;
  notes: string;
  demo_result_note: string;
};

const SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral / Lead by" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "other_marketing", label: "Other Marketing" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "demo_booked", label: "Demo Booked" },
  { value: "demo_completed", label: "Demo Completed" },
  { value: "no_show", label: "No-show" },
  { value: "interested", label: "Interested" },
  { value: "follow_up", label: "Follow-up" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not booked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sourceLabel(value: LeadSource, detail: string | null) {
  const base = SOURCE_OPTIONS.find((item) => item.value === value)?.label || value;
  return detail ? `${base} — ${detail}` : base;
}

function statusClass(status: LeadStatus) {
  if (status === "converted" || status === "demo_completed") {
    return "border-green-400/30 bg-green-400/10 text-green-300";
  }
  if (status === "no_show" || status === "lost") {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }
  if (status === "demo_booked" || status === "interested") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  }
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
}

export default function AdminLeadsPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const canManageLeads = role === "admin" || role === "manager";
  const canDeleteLeads = role === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<MarketingCampaignOption[]>([]);
  const [contentOptions, setContentOptions] = useState<MarketingContentOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceType, setSourceType] = useState<LeadSource>("walk_in");
  const [sourceDetail, setSourceDetail] = useState("");
  const [status, setStatus] = useState<LeadStatus>("new");
  const [demoAt, setDemoAt] = useState("");
  const [assignedTrainerId, setAssignedTrainerId] = useState("");
  const [marketingCampaignId, setMarketingCampaignId] = useState("");
  const [marketingContentId, setMarketingContentId] = useState("");
  const [notes, setNotes] = useState("");

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LeadEditDraft | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [leadResult, staffResult, campaignResult, contentResult] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["trainer", "nutrition_coach"])
        .order("full_name", { ascending: true }),
      supabase
        .from("marketing_campaigns")
        .select("id, campaign_name, platform, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("marketing_content")
        .select("id, title, platform, publish_date")
        .order("publish_date", { ascending: false })
        .limit(1000),
    ]);

    if (leadResult.error) {
      alert(leadResult.error.message);
      setLoading(false);
      return;
    }
    if (staffResult.error) {
      alert(staffResult.error.message);
      setLoading(false);
      return;
    }
    if (campaignResult.error) {
      alert(campaignResult.error.message);
      setLoading(false);
      return;
    }
    if (contentResult.error) {
      alert(contentResult.error.message);
      setLoading(false);
      return;
    }

    setLeads((leadResult.data || []) as LeadRow[]);
    setStaff((staffResult.data || []) as StaffRow[]);
    setCampaignOptions((campaignResult.data || []) as MarketingCampaignOption[]);
    setContentOptions((contentResult.data || []) as MarketingContentOption[]);
    setLoading(false);
  }

  async function addLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageLeads) {
      alert("Marketing Manager access is read-only.");
      return;
    }
    if (!fullName.trim()) {
      alert("Lead name is required.");
      return;
    }

    setSaving(true);
    const { data: authData } = await supabase.auth.getUser();
    const nextStatus: LeadStatus = demoAt ? "demo_booked" : status;

    const { error } = await supabase.from("leads").insert({
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      source_type: sourceType,
      source_detail: sourceDetail.trim() || null,
      status: nextStatus,
      demo_at: demoAt ? new Date(demoAt).toISOString() : null,
      assigned_trainer_id: assignedTrainerId || null,
      marketing_campaign_id: marketingCampaignId || null,
      marketing_content_id: marketingContentId || null,
      notes: notes.trim() || null,
      created_by: authData.user?.id || null,
    });

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    setFullName("");
    setEmail("");
    setPhone("");
    setSourceType("walk_in");
    setSourceDetail("");
    setStatus("new");
    setDemoAt("");
    setAssignedTrainerId("");
    setMarketingCampaignId("");
    setMarketingContentId("");
    setNotes("");
    await loadData();
    setSaving(false);
  }

  function startEditLead(lead: LeadRow) {
    if (!canManageLeads) return;
    setEditingLeadId(lead.id);
    setEditDraft({
      full_name: lead.full_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      source_type: lead.source_type,
      source_detail: lead.source_detail || "",
      status: lead.status,
      demo_at: toDateTimeLocal(lead.demo_at),
      assigned_trainer_id: lead.assigned_trainer_id || "",
      marketing_campaign_id: lead.marketing_campaign_id || "",
      marketing_content_id: lead.marketing_content_id || "",
      notes: lead.notes || "",
      demo_result_note: lead.demo_result_note || "",
    });
  }

  function cancelEditLead() {
    setEditingLeadId(null);
    setEditDraft(null);
  }

  function setEditField<Key extends keyof LeadEditDraft>(
    key: Key,
    value: LeadEditDraft[Key],
  ) {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  async function saveLeadEdit(lead: LeadRow) {
    if (!canManageLeads) return;
    if (!editDraft || editingLeadId !== lead.id) return;

    if (!editDraft.full_name.trim()) {
      alert("Lead name is required.");
      return;
    }

    const confirmed = window.confirm(
      `Save changes for ${editDraft.full_name.trim()}?`,
    );

    if (!confirmed) return;

    setSavingEditId(lead.id);

    const { error } = await supabase
      .from("leads")
      .update({
        full_name: editDraft.full_name.trim(),
        email: editDraft.email.trim() || null,
        phone: editDraft.phone.trim() || null,
        source_type: editDraft.source_type,
        source_detail: editDraft.source_detail.trim() || null,
        status: editDraft.status,
        demo_at: editDraft.demo_at
          ? new Date(editDraft.demo_at).toISOString()
          : null,
        assigned_trainer_id: editDraft.assigned_trainer_id || null,
        marketing_campaign_id: editDraft.marketing_campaign_id || null,
        marketing_content_id: editDraft.marketing_content_id || null,
        notes: editDraft.notes.trim() || null,
        demo_result_note: editDraft.demo_result_note.trim() || null,
      })
      .eq("id", lead.id);

    if (error) {
      alert(error.message);
      setSavingEditId(null);
      return;
    }

    cancelEditLead();
    await loadData();
    setSavingEditId(null);
    alert("Demo updated.");
  }

  async function deleteLead(lead: LeadRow) {
    if (role !== "admin") {
      alert("Only admins can delete demos.");
      return;
    }

    if (lead.converted_client_id || lead.status === "converted") {
      alert(
        "This lead has already been converted to a client and cannot be deleted. Keep it for audit history.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete demo for ${lead.full_name}?\n\nThis permanently removes the lead and demo record. This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingId(lead.id);

    const { error } = await supabase.from("leads").delete().eq("id", lead.id);

    if (error) {
      alert(error.message);
      setDeletingId(null);
      return;
    }

    if (editingLeadId === lead.id) {
      cancelEditLead();
    }

    await loadData();
    setDeletingId(null);
    alert("Demo deleted.");
  }

  async function updateLead(id: string, patch: Partial<LeadRow>) {
    if (!canManageLeads) return;
    const payload: Record<string, unknown> = { ...patch };
    if (patch.demo_at !== undefined) {
      payload.demo_at = patch.demo_at ? new Date(patch.demo_at).toISOString() : null;
    }
    const { error } = await supabase.from("leads").update(payload).eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadData();
  }

  async function convertLead(lead: LeadRow) {
    if (!canManageLeads) return;
    if (lead.converted_client_id) {
      router.push(`/admin/clients/${lead.converted_client_id}`);
      return;
    }
    const confirmed = window.confirm(`Convert ${lead.full_name} to a client?`);
    if (!confirmed) return;

    setConvertingId(lead.id);
    const { data, error } = await supabase.rpc("convert_lead_to_client", {
      p_lead_id: lead.id,
    });
    if (error) {
      alert(error.message);
      setConvertingId(null);
      return;
    }
    const clientId = typeof data === "string" ? data : null;
    await loadData();
    setConvertingId(null);
    if (clientId) router.push(`/admin/clients/${clientId}`);
  }

  const staffMap = useMemo(
    () => new Map(staff.map((person) => [person.id, person.full_name || person.email || "Staff"])),
    [staff],
  );

  const campaignMap = useMemo(
    () => new Map(campaignOptions.map((item) => [item.id, item])),
    [campaignOptions],
  );

  const contentMap = useMemo(
    () => new Map(contentOptions.map((item) => [item.id, item])),
    [contentOptions],
  );

  const filteredLeads = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (sourceFilter !== "all" && lead.source_type !== sourceFilter) return false;
      if (!cleanSearch) return true;
      return [
        lead.full_name,
        lead.email,
        lead.phone,
        lead.source_detail,
        lead.notes,
        staffMap.get(lead.assigned_trainer_id || ""),
        campaignMap.get(lead.marketing_campaign_id || "")?.campaign_name,
        contentMap.get(lead.marketing_content_id || "")?.title,
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch);
    });
  }, [campaignMap, contentMap, leads, search, sourceFilter, staffMap, statusFilter]);

  const upcomingLeads = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return filteredLeads
      .filter((lead) => {
        if (!lead.demo_at) return false;
        const demo = new Date(lead.demo_at);
        return demo >= now && demo <= end;
      })
      .sort((a, b) => new Date(a.demo_at || 0).getTime() - new Date(b.demo_at || 0).getTime());
  }, [filteredLeads]);

  useEffect(() => {
    async function protectPage() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      const normalizedRole = String(currentRole ?? "");
      const allowedRoles = ["admin", "manager", "marketing_manager"] as const;

      if (!allowedRoles.includes(normalizedRole as (typeof allowedRoles)[number])) {
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

      setRole(normalizedRole);
      setCheckingRole(false);
      await loadData();
    }
    protectPage();
  }, [router]);

  if (checkingRole) {
    return <main className="min-h-screen bg-black p-6 text-yellow-400">Checking access...</main>;
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-yellow-400">FXA FITNESS</p>
              <h1 className="mt-2 text-4xl font-semibold md:text-6xl">Leads & Demo</h1>
              <p className="mt-2 text-sm text-gray-400">Store potential clients, assign PTs, and schedule demos.</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-xl border border-white/15 px-4 py-2 text-xs uppercase text-gray-300">{role}</span>
              <Link
                href={role === "marketing_manager" ? "/admin/marketing" : "/admin"}
                className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-black"
              >
                {role === "marketing_manager" ? "Marketing" : "Back to Admin"}
              </Link>
            </div>
          </div>
        </header>

        {canManageLeads ? (
        <form onSubmit={addLead} className="mb-6 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6">
          <h2 className="text-2xl font-semibold text-yellow-400">Add Potential Client</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as LeadSource)} className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-black">
              {SOURCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} placeholder="Lead by / campaign detail" className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
            <select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-black">
              {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input type="datetime-local" value={demoAt} onChange={(e) => setDemoAt(e.target.value)} className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
            <select value={assignedTrainerId} onChange={(e) => setAssignedTrainerId(e.target.value)} className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-black">
              <option value="">Assign later</option>
              {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} {person.role === "nutrition_coach" ? "(NC)" : "(PT)"}</option>)}
            </select>
            <select value={marketingCampaignId} onChange={(e) => setMarketingCampaignId(e.target.value)} className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-black">
              <option value="">No linked campaign</option>
              {campaignOptions.map((item) => <option key={item.id} value={item.id}>{item.platform} — {item.campaign_name}</option>)}
            </select>
            <select value={marketingContentId} onChange={(e) => setMarketingContentId(e.target.value)} className="rounded-2xl border border-white/15 bg-white px-4 py-3 text-black">
              <option value="">No linked content</option>
              {contentOptions.map((item) => <option key={item.id} value={item.id}>{item.publish_date} — {item.platform} — {item.title}</option>)}
            </select>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
          </div>
          <button disabled={saving} className="mt-5 rounded-2xl bg-yellow-400 px-6 py-3 font-semibold uppercase text-black disabled:opacity-60">{saving ? "Saving..." : "Add Lead"}</button>
        </form>
        ) : (
          <div className="mb-6 rounded-3xl border border-sky-400/25 bg-sky-400/[0.08] p-5 text-sm text-sky-200">
            Marketing Manager access is read-only. You can review leads, sources, campaigns, demo schedules, and conversion status, but you cannot add or change records.
          </div>
        )}

        <section className="mb-6 rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Upcoming Week</p>
              <h2 className="mt-1 text-2xl font-semibold">Scheduled Demos</h2>
            </div>
            <p className="text-sm text-cyan-200">{upcomingLeads.length} demo(s)</p>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead><tr className="bg-cyan-300 text-black"><th className="px-4 py-3">Date & Time</th><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Assigned PT</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody>
                {upcomingLeads.map((lead) => <tr key={lead.id} className="border-b border-white/10 bg-black/40"><td className="px-4 py-3">{formatDateTime(lead.demo_at)}</td><td className="px-4 py-3"><p className="font-semibold">{lead.full_name}</p><p className="text-xs text-gray-400">{lead.phone || lead.email || "No contact"}</p></td><td className="px-4 py-3">{sourceLabel(lead.source_type, lead.source_detail)}</td><td className="px-4 py-3">{staffMap.get(lead.assigned_trainer_id || "") || "Unassigned"}</td><td className="px-4 py-3"><span className={`rounded-full border px-3 py-1 text-xs uppercase ${statusClass(lead.status)}`}>{lead.status.replaceAll("_", " ")}</span></td></tr>)}
              </tbody>
            </table>
            {upcomingLeads.length === 0 ? <p className="p-5 text-sm text-gray-400">No demos scheduled in the next seven days.</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6">
          <div className="grid gap-3 md:grid-cols-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lead..." className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl bg-white px-4 py-3 text-black"><option value="all">All statuses</option>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-2xl bg-white px-4 py-3 text-black"><option value="all">All sources</option>{SOURCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </div>

          {loading ? <p className="py-8 text-center text-yellow-400">Loading leads...</p> : (
            <div className="mt-5 space-y-4">
              {filteredLeads.map((lead) => {
                const isEditing = editingLeadId === lead.id && editDraft !== null;

                return (
                  <div
                    id={`lead-${lead.id}`}
                    key={lead.id}
                    className={`rounded-3xl border p-5 ${
                      isEditing
                        ? "border-cyan-400/50 bg-cyan-400/10"
                        : "border-white/10 bg-black/45"
                    }`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
                      <div>
                        <h3 className="text-xl font-semibold text-white">
                          {lead.full_name}
                        </h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {lead.phone || "No phone"} · {lead.email || "No email"}
                        </p>
                        <p className="mt-2 text-sm text-yellow-300">
                          {sourceLabel(lead.source_type, lead.source_detail)}
                        </p>
                        {lead.marketing_campaign_id ? (
                          <p className="mt-2 text-xs text-violet-300">
                            Campaign: {campaignMap.get(lead.marketing_campaign_id)?.campaign_name || "Linked campaign"}
                          </p>
                        ) : null}
                        {lead.marketing_content_id ? (
                          <p className="mt-1 text-xs text-cyan-300">
                            Content: {contentMap.get(lead.marketing_content_id)?.title || "Linked content"}
                          </p>
                        ) : null}
                        {lead.notes ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">
                            {lead.notes}
                          </p>
                        ) : null}
                        {lead.demo_result_note ? (
                          <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                              Demo Result
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">
                              {lead.demo_result_note}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs uppercase text-gray-400">
                          Demo date
                        </label>
                        <input
                          type="datetime-local"
                          defaultValue={toDateTimeLocal(lead.demo_at)}
                          onBlur={(event) =>
                            updateLead(lead.id, {
                              demo_at: event.target.value || null,
                              status: event.target.value
                                ? "demo_booked"
                                : lead.status,
                            })
                          }
                          disabled={isEditing || !canManageLeads}
                          className="mt-2 w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2 disabled:opacity-50"
                        />

                        <label className="mt-3 block text-xs uppercase text-gray-400">
                          Assigned PT
                        </label>
                        <select
                          value={lead.assigned_trainer_id || ""}
                          onChange={(event) =>
                            updateLead(lead.id, {
                              assigned_trainer_id: event.target.value || null,
                            })
                          }
                          disabled={isEditing || !canManageLeads}
                          className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-black disabled:opacity-50"
                        >
                          <option value="">Unassigned</option>
                          {staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name || person.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs uppercase text-gray-400">
                          Status
                        </label>
                        <select
                          value={lead.status}
                          onChange={(event) =>
                            updateLead(lead.id, {
                              status: event.target.value as LeadStatus,
                            })
                          }
                          disabled={isEditing || !canManageLeads}
                          className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-black disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => convertLead(lead)}
                          disabled={
                            !canManageLeads ||
                            convertingId === lead.id ||
                            lead.status === "lost" ||
                            isEditing
                          }
                          className="mt-4 w-full rounded-xl bg-green-400 px-4 py-3 font-semibold uppercase text-black disabled:opacity-50"
                        >
                          {lead.converted_client_id
                            ? "Open Client"
                            : convertingId === lead.id
                              ? "Converting..."
                              : "Convert to Client"}
                        </button>
                      </div>
                    </div>

                    {canManageLeads ? (
                    <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row">
                      <button
                        type="button"
                        onClick={() =>
                          isEditing ? cancelEditLead() : startEditLead(lead)
                        }
                        disabled={
                          savingEditId === lead.id || deletingId === lead.id
                        }
                        className="rounded-xl border border-cyan-400 px-4 py-2 text-sm font-semibold uppercase text-cyan-300 transition hover:bg-cyan-400 hover:text-black disabled:opacity-50"
                      >
                        {isEditing ? "Close Edit" : "Edit Demo"}
                      </button>

                      {canDeleteLeads ? (
                        <button
                          type="button"
                          onClick={() => deleteLead(lead)}
                          disabled={
                            deletingId === lead.id ||
                            savingEditId === lead.id ||
                            Boolean(lead.converted_client_id) ||
                            lead.status === "converted"
                          }
                          className="rounded-xl border border-red-400 px-4 py-2 text-sm font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {deletingId === lead.id
                            ? "Deleting..."
                            : "Delete Demo"}
                        </button>
                      ) : (
                        <span className="self-center text-xs text-gray-500">
                          Only Admin can delete demos.
                        </span>
                      )}
                    </div>
                    ) : null}

                    {canManageLeads && isEditing && editDraft ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveLeadEdit(lead);
                        }}
                        className="mt-5 rounded-2xl border border-cyan-400/30 bg-black/55 p-5"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                              Edit Lead & Demo
                            </p>
                            <h4 className="mt-1 text-xl font-semibold text-white">
                              Update complete demo information
                            </h4>
                          </div>
                          <span className="text-xs text-gray-500">
                            Lead ID: {lead.id}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Full Name
                            </span>
                            <input
                              value={editDraft.full_name}
                              onChange={(event) =>
                                setEditField("full_name", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                              required
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Phone
                            </span>
                            <input
                              value={editDraft.phone}
                              onChange={(event) =>
                                setEditField("phone", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Email
                            </span>
                            <input
                              type="email"
                              value={editDraft.email}
                              onChange={(event) =>
                                setEditField("email", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Source
                            </span>
                            <select
                              value={editDraft.source_type}
                              onChange={(event) =>
                                setEditField(
                                  "source_type",
                                  event.target.value as LeadSource,
                                )
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-white px-4 py-3 text-black outline-none"
                            >
                              {SOURCE_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Lead By / Campaign
                            </span>
                            <input
                              value={editDraft.source_detail}
                              onChange={(event) =>
                                setEditField("source_detail", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Status
                            </span>
                            <select
                              value={editDraft.status}
                              onChange={(event) =>
                                setEditField(
                                  "status",
                                  event.target.value as LeadStatus,
                                )
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-white px-4 py-3 text-black outline-none"
                            >
                              {STATUS_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Demo Date & Time
                            </span>
                            <input
                              type="datetime-local"
                              value={editDraft.demo_at}
                              onChange={(event) =>
                                setEditField("demo_at", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Assigned PT / NC
                            </span>
                            <select
                              value={editDraft.assigned_trainer_id}
                              onChange={(event) =>
                                setEditField(
                                  "assigned_trainer_id",
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-white px-4 py-3 text-black outline-none"
                            >
                              <option value="">Unassigned</option>
                              {staff.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.full_name || person.email}{" "}
                                  {person.role === "nutrition_coach"
                                    ? "(NC)"
                                    : "(PT)"}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Marketing Campaign
                            </span>
                            <select
                              value={editDraft.marketing_campaign_id}
                              onChange={(event) =>
                                setEditField("marketing_campaign_id", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-white px-4 py-3 text-black outline-none"
                            >
                              <option value="">No linked campaign</option>
                              {campaignOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.platform} — {item.campaign_name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Marketing Content
                            </span>
                            <select
                              value={editDraft.marketing_content_id}
                              onChange={(event) =>
                                setEditField("marketing_content_id", event.target.value)
                              }
                              className="w-full rounded-xl border border-cyan-400/30 bg-white px-4 py-3 text-black outline-none"
                            >
                              <option value="">No linked content</option>
                              {contentOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.publish_date} — {item.platform} — {item.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Lead Notes
                            </span>
                            <textarea
                              value={editDraft.notes}
                              onChange={(event) =>
                                setEditField("notes", event.target.value)
                              }
                              className="min-h-28 w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase text-gray-400">
                              Demo Result Note
                            </span>
                            <textarea
                              value={editDraft.demo_result_note}
                              onChange={(event) =>
                                setEditField(
                                  "demo_result_note",
                                  event.target.value,
                                )
                              }
                              className="min-h-28 w-full rounded-xl border border-cyan-400/30 bg-black/70 px-4 py-3 text-white outline-none focus:border-cyan-300"
                            />
                          </label>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="submit"
                            disabled={savingEditId === lead.id}
                            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-cyan-300 disabled:opacity-50"
                          >
                            {savingEditId === lead.id
                              ? "Saving..."
                              : "Save Demo Changes"}
                          </button>

                          <button
                            type="button"
                            onClick={cancelEditLead}
                            disabled={savingEditId === lead.id}
                            className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold uppercase text-white transition hover:bg-white/10 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
              {filteredLeads.length === 0 ? <p className="py-8 text-center text-gray-400">No leads found.</p> : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
