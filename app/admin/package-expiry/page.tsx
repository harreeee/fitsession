"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import { businessDate, currentPackage as selectCurrentPackage } from "../../../lib/businessTime";

type Role = "admin" | "manager";

type ClientRow = {
  id: string;
  client_code: string | null;
  full_name: string;
  status: string | null;
};

type PackageRow = {
  id: string;
  client_id: string;
  package_name: string | null;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type AuditRow = {
  audit_id: string;
  package_id: string;
  client_id: string;
  client_code: string | null;
  client_name: string;
  old_expiry: string | null;
  new_expiry: string;
  reason: string;
  changed_by: string;
  changed_by_name: string;
  changed_at: string;
};

type DisplayRow = {
  client: ClientRow;
  packageRow: PackageRow | null;
  remaining: number;
  expired: boolean;
  notStarted: boolean;
};

function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No expiry";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
}

function packageRemaining(row: PackageRow | null) {
  if (!row) return 0;
  if (row.remaining_sessions !== null && row.remaining_sessions !== undefined) {
    return Number(row.remaining_sessions);
  }
  return Math.max(Number(row.total_sessions || 0) - Number(row.used_sessions || 0), 0);
}

export default function PackageExpiryAdminPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [search, setSearch] = useState("");
  const [showOnlyNeedsAction, setShowOnlyNeedsAction] = useState(true);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [newExpiry, setNewExpiry] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const today = businessDate();
  const canEdit = role === "admin";

  async function loadData() {
    setLoading(true);
    setMessage("");

    const [clientResult, packageResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, client_code, full_name, status")
        .order("full_name", { ascending: true }),
      supabase
        .from("session_packages")
        .select(
          "id, client_id, package_name, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, created_at",
        )
        .order("created_at", { ascending: false }),
    ]);

    if (clientResult.error) {
      setMessage(clientResult.error.message);
      setLoading(false);
      return;
    }
    if (packageResult.error) {
      setMessage(packageResult.error.message);
      setLoading(false);
      return;
    }

    setClients((clientResult.data || []) as ClientRow[]);
    setPackages((packageResult.data || []) as PackageRow[]);
    setLoading(false);
  }

  async function loadHistory(clientId: string) {
    setHistoryClientId(clientId);
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc("fxa_package_expiry_history", {
      p_client_id: clientId,
      p_limit: 50,
    });
    if (error) {
      setMessage(error.message);
      setHistory([]);
    } else {
      setHistory((data || []) as AuditRow[]);
    }
    setHistoryLoading(false);
  }

  useEffect(() => {
    let alive = true;
    async function init() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!alive) return;
      if (!user) {
        router.push("/login");
        return;
      }
      if (currentRole !== "admin" && currentRole !== "manager") {
        router.push(currentRole === "client" ? "/client" : "/trainer/scan");
        return;
      }
      setRole(currentRole);
      setChecking(false);
      await loadData();
    }
    void init();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const rows = useMemo<DisplayRow[]>(() => {
    const byClient = new Map<string, PackageRow[]>();
    for (const packageRow of packages) {
      const list = byClient.get(packageRow.client_id) || [];
      list.push(packageRow);
      byClient.set(packageRow.client_id, list);
    }

    return clients.map((client) => {
      const packageRow = selectCurrentPackage(byClient.get(client.id) || []);
      const remaining = packageRemaining(packageRow);
      const expiry = toDateInput(packageRow?.expires_at);
      const start = toDateInput(packageRow?.starts_at);
      return {
        client,
        packageRow,
        remaining,
        expired: Boolean(packageRow?.status === "active" && expiry && expiry < today),
        notStarted: Boolean(packageRow?.status === "active" && start && start > today),
      };
    });
  }, [clients, packages, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (showOnlyNeedsAction && !(row.expired && row.remaining > 0)) return false;
        if (!q) return true;
        return (
          row.client.full_name.toLowerCase().includes(q) ||
          String(row.client.client_code || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.expired !== b.expired) return a.expired ? -1 : 1;
        return a.client.full_name.localeCompare(b.client.full_name);
      });
  }, [rows, search, showOnlyNeedsAction]);

  const needsActionCount = rows.filter((row) => row.expired && row.remaining > 0).length;

  function beginEdit(row: DisplayRow) {
    if (!row.packageRow || !canEdit) return;
    setEditingClientId(row.client.id);
    setNewExpiry(toDateInput(row.packageRow.expires_at));
    setReason("");
    setMessage("");
  }

  async function saveExpiry(row: DisplayRow) {
    if (!canEdit || !row.packageRow || saving) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newExpiry)) {
      setMessage("Choose a valid new expiry date.");
      return;
    }
    if (reason.trim().length < 3) {
      setMessage("Enter a short reason for the expiry change.");
      return;
    }

    const startDate = toDateInput(row.packageRow.starts_at);
    if (startDate && newExpiry < startDate) {
      setMessage(`Expiry cannot be before the package start date (${startDate}).`);
      return;
    }

    const oldExpiry = toDateInput(row.packageRow.expires_at);
    if (newExpiry === oldExpiry) {
      setMessage("The new expiry date is the same as the current date.");
      return;
    }

    const confirmed = window.confirm(
      `Change ${row.client.full_name}'s package expiry from ${oldExpiry || "none"} to ${newExpiry}?\n\nRemaining sessions will stay at ${row.remaining}. No payment or session history will change.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase.rpc("fxa_update_package_expiry", {
      p_package_id: row.packageRow.id,
      p_expected_expiry: oldExpiry || null,
      p_new_expiry: newExpiry,
      p_reason: reason.trim(),
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    const result = data as { changed?: boolean; new_expiry?: string } | null;
    setMessage(
      result?.changed
        ? `Expiry updated to ${newExpiry}. Session balance was not changed.`
        : "No change was needed.",
    );
    setEditingClientId(null);
    setReason("");
    await loadData();
    if (historyClientId === row.client.id) await loadHistory(row.client.id);
    setSaving(false);
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="text-yellow-400">Checking package access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-yellow-400">FXA FITNESS</p>
            <h1 className="mt-2 text-3xl font-bold md:text-5xl">Package Expiry Management</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
              Fix package expiry dates without changing session balances, payments, or session history. Every change is recorded in an audit log.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/clients" className="rounded-xl border border-white/15 px-4 py-3 text-sm text-gray-300 hover:border-yellow-400 hover:text-yellow-300">
              Clients
            </Link>
            <Link href="/admin" className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black hover:bg-yellow-300">
              Admin Home
            </Link>
          </div>
        </header>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
            <p className="text-xs uppercase tracking-widest text-red-300">Needs action</p>
            <p className="mt-2 text-4xl font-bold text-red-200">{needsActionCount}</p>
            <p className="mt-1 text-xs text-gray-400">Expired packages that still have sessions remaining</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <p className="text-xs uppercase tracking-widest text-gray-400">Role</p>
            <p className="mt-2 text-xl font-semibold">{role === "admin" ? "Admin - edit" : "Manager - read only"}</p>
          </div>
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-xs uppercase tracking-widest text-yellow-300">Protection</p>
            <p className="mt-2 text-sm leading-6 text-gray-300">Expiry edit does not touch total, used, remaining, purchase, debt, or session history.</p>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search client name or code"
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-sm outline-none focus:border-yellow-400"
            />
            <button
              type="button"
              onClick={() => setShowOnlyNeedsAction((value) => !value)}
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${showOnlyNeedsAction ? "bg-red-400 text-black" : "border border-white/15 text-gray-300"}`}
            >
              {showOnlyNeedsAction ? "Showing expired + sessions left" : "Showing all clients"}
            </button>
          </div>
        </section>

        {message ? (
          <div className="mb-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-100">{message}</div>
        ) : null}

        {loading ? (
          <p className="text-gray-400">Loading packages...</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((row) => {
              const packageRow = row.packageRow;
              const editing = editingClientId === row.client.id;
              return (
                <section key={row.client.id} className={`rounded-2xl border p-4 ${row.expired && row.remaining > 0 ? "border-red-400/40 bg-red-400/[0.08]" : "border-white/10 bg-white/[0.04]"}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{row.client.full_name}</h2>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-gray-400">{row.client.client_code || "No code"}</span>
                        {row.expired && row.remaining > 0 ? <span className="rounded-full bg-red-400 px-2 py-1 text-xs font-bold text-black">EXPIRED - SESSIONS LEFT</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-400">
                        <span>Package: <b className="text-gray-200">{packageRow?.package_name || "-"}</b></span>
                        <span>Status: <b className="text-gray-200">{packageRow?.status || "No package"}</b></span>
                        <span>Remaining: <b className="text-yellow-300">{row.remaining}</b></span>
                        <span>Start: <b className="text-gray-200">{formatDate(packageRow?.starts_at)}</b></span>
                        <span>Expiry: <b className={row.expired ? "text-red-300" : "text-gray-200"}>{formatDate(packageRow?.expires_at)}</b></span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/clients/${row.client.id}`} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-gray-300 hover:border-yellow-400">Client Detail</Link>
                      <button type="button" onClick={() => void loadHistory(row.client.id)} className="rounded-xl border border-purple-400/30 px-3 py-2 text-xs text-purple-300 hover:bg-purple-400/10">History</button>
                      {canEdit && packageRow?.status === "active" ? (
                        <button type="button" onClick={() => beginEdit(row)} className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-bold text-black hover:bg-yellow-300">Edit Expiry</button>
                      ) : null}
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-yellow-400/30 bg-black/50 p-4 md:grid-cols-[220px_1fr_auto]">
                      <label>
                        <span className="mb-2 block text-xs uppercase tracking-widest text-yellow-300">New expiry</span>
                        <input type="date" value={newExpiry} onChange={(event) => setNewExpiry(event.target.value)} className="w-full rounded-xl border border-yellow-400/30 bg-black px-3 py-2 text-white" />
                      </label>
                      <label>
                        <span className="mb-2 block text-xs uppercase tracking-widest text-yellow-300">Reason</span>
                        <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Example: Approved extension due to client travel" className="w-full rounded-xl border border-yellow-400/30 bg-black px-3 py-2 text-white" />
                      </label>
                      <div className="flex items-end gap-2">
                        <button type="button" disabled={saving} onClick={() => void saveExpiry(row)} className="rounded-xl bg-green-400 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                        <button type="button" disabled={saving} onClick={() => setEditingClientId(null)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-gray-300">Cancel</button>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
            {filtered.length === 0 ? <div className="rounded-2xl border border-white/10 p-8 text-center text-gray-500">No clients match this view.</div> : null}
          </div>
        )}

        {historyClientId ? (
          <section className="mt-6 rounded-2xl border border-purple-400/30 bg-purple-400/[0.06] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Expiry Change History</h2>
              <button type="button" onClick={() => { setHistoryClientId(null); setHistory([]); }} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-gray-300">Close</button>
            </div>
            {historyLoading ? <p className="mt-4 text-gray-400">Loading history...</p> : history.length === 0 ? <p className="mt-4 text-gray-500">No expiry changes recorded for this client.</p> : (
              <div className="mt-4 space-y-2">
                {history.map((item) => (
                  <div key={item.audit_id} className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
                    <p><b className="text-purple-300">{formatDate(item.old_expiry)}</b> → <b className="text-green-300">{formatDate(item.new_expiry)}</b></p>
                    <p className="mt-1 text-gray-300">{item.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.changed_by_name} · {formatDateTime(item.changed_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
