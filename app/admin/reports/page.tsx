"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ReportType =
  | "business-html"
  | "business-csv"
  | "session-html"
  | "session-csv"
  | "clients";

type PeriodMode = "month" | "year" | "custom";
type ClientPeriodMode = "all" | PeriodMode;
type SessionStatusFilter = "all" | "success" | "failed" | "cancelled";

type BusinessTransaction = {
  id: string;
  transaction_type: "income" | "expense" | "cash_adjustment";
  source: string | null;
  title: string | null;
  amount: number | string | null;
  notes: string | null;
  transaction_date: string;
  created_at: string | null;
};

type SessionHistoryRow = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string | null;
};

type ClientRow = {
  id: string;
  client_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  status: string | null;
  client_source: string | null;
  client_source_other: string | null;
  assigned_trainer_id: string | null;
  assigned_nutrition_coach_id: string | null;
  created_at: string | null;
};

type SessionPackageRow = {
  id: string;
  client_id: string;
  package_name: string | null;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  package_value: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type ClientPurchaseRow = {
  id: string;
  client_id: string;
  plan_name: string | null;
  session_count: number | null;
  price: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  debt_deadline: string | null;
  purchase_type: string | null;
  status: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type ReportData = {
  transactions: BusinessTransaction[];
  sessions: SessionHistoryRow[];
  clients: ClientRow[];
  packages: SessionPackageRow[];
  purchases: ClientPurchaseRow[];
  profiles: ProfileRow[];
};

type ClientExportRow = {
  clientCode: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  personalTrainer: string;
  nutritionCoach: string;
  packageName: string;
  startDate: string;
  expireDate: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  packageValue: number | null;
  latestPurchaseType: string;
  amountPaid: number | null;
  balanceDue: number | null;
  debtDeadline: string;
  createdAt: string;
};

type PeriodRange = {
  startDate: string;
  endDateExclusive: string;
  startIso: string;
  endIso: string;
  label: string;
  fileLabel: string;
};

type PeriodRangeState = {
  range: PeriodRange | null;
  error: string;
};

type SessionSummary = {
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  uniqueClients: number;
};

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function localDateStartIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function getPeriodRange(
  mode: PeriodMode,
  year: number,
  month: number,
  customStart: string,
  customEnd: string
): PeriodRangeState {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { range: null, error: "Enter a valid year between 2000 and 2100." };
  }

  let startDate = "";
  let endDateExclusive = "";
  let label = "";
  let fileLabel = "";

  if (mode === "month") {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { range: null, error: "Select a valid month." };
    }

    startDate = dateString(year, month, 1);
    endDateExclusive = month === 12 ? dateString(year + 1, 1, 1) : dateString(year, month + 1, 1);
    label = `${MONTH_OPTIONS[month - 1]} ${year}`;
    fileLabel = `${year}-${pad(month)}`;
  }

  if (mode === "year") {
    startDate = dateString(year, 1, 1);
    endDateExclusive = dateString(year + 1, 1, 1);
    label = String(year);
    fileLabel = String(year);
  }

  if (mode === "custom") {
    if (!customStart || !customEnd) {
      return { range: null, error: "Choose both a start date and an end date." };
    }

    if (customStart > customEnd) {
      return { range: null, error: "The start date cannot be later than the end date." };
    }

    startDate = customStart;
    endDateExclusive = addDays(customEnd, 1);
    label = `${formatDate(customStart)} to ${formatDate(customEnd)}`;
    fileLabel = `${customStart}_to_${customEnd}`;
  }

  return {
    range: {
      startDate,
      endDateExclusive,
      startIso: localDateStartIso(startDate),
      endIso: localDateStartIso(endDateExclusive),
      label,
      fileLabel,
    },
    error: "",
  };
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const cleanValue = Number(value);
  return Number.isNaN(cleanValue) ? null : cleanValue;
}

function money(value: number | string | null | undefined) {
  const cleanValue = toNumber(value) ?? 0;

  return `$${cleanValue.toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function percent(value: number | null | undefined) {
  const cleanValue = Number(value || 0);

  return `${cleanValue.toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

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

function getTime(value: string | null | undefined) {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getLatestByDate<T extends { created_at: string | null }>(rows: T[]) {
  if (rows.length === 0) return null;

  return [...rows].sort((a, b) => getTime(b.created_at) - getTime(a.created_at))[0];
}

function isDateInRange(value: string | null | undefined, range: PeriodRange) {
  const time = getTime(value);
  return time >= getTime(range.startIso) && time < getTime(range.endIso);
}

function getDateKey(value: string | null | undefined) {
  if (!value) return "";
  if (value.length <= 10) return value.slice(0, 10);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function cleanText(value: unknown) {
  return String(value ?? "").normalize("NFC");
}

function cleanCsvCell(value: unknown) {
  return `"${cleanText(value).replace(/"/g, '""')}"`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv =
    "\uFEFF" +
    [headers, ...rows]
      .map((row) => row.map((cell) => cleanCsvCell(cell)).join(","))
      .join("\n");

  downloadFile(filename, csv, "text/csv;charset=utf-8;");
}

function escapeHtml(value: unknown) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTransactionTypeLabel(type: string | null | undefined) {
  if (type === "income") return "Income";
  if (type === "expense") return "Expense";
  if (type === "cash_adjustment") return "Cash Adjustment";
  return type || "-";
}

function getSourceLabel(source: string | null | undefined) {
  if (!source) return "Manual";

  const labels: Record<string, string> = {
    package_sale: "Package Sale",
    membership: "Membership",
    personal_training: "Personal Training",
    debt_payment: "Debt Payment",
    merchandise: "Merchandise",
    rent: "Rent",
    payroll: "Payroll",
    utilities: "Utilities",
    marketing: "Marketing",
    equipment: "Equipment",
    manual: "Manual",
    other: "Other",
  };

  return (
    labels[source] ||
    source
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function getClientSourceLabel(source: string | null, sourceOther: string | null) {
  if (!source) return "-";

  const labels: Record<string, string> = {
    coach: "Coach",
    google: "Google",
    facebook: "Facebook",
    instagram: "Instagram",
    direct_lead_walk_in: "Walk In",
    referral_lead: "Referral",
    other: "Other",
  };

  if (source === "other") return sourceOther ? `Other: ${sourceOther}` : "Other";
  return labels[source] || source;
}

function getPurchaseTypeLabel(value: string | null | undefined) {
  const cleanValue = String(value || "").toLowerCase();

  if (cleanValue === "new") return "New";
  if (cleanValue === "renew" || cleanValue === "renewal") return "Renew";
  if (cleanValue === "debt") return "Debt";

  return value || "-";
}

function getPackageNumbers(packageRow: SessionPackageRow | null) {
  const totalSessions = toNumber(packageRow?.total_sessions) ?? 0;
  const usedSessions = toNumber(packageRow?.used_sessions) ?? 0;
  const savedRemaining = toNumber(packageRow?.remaining_sessions);
  const remainingSessions =
    savedRemaining !== null ? savedRemaining : Math.max(totalSessions - usedSessions, 0);

  return { totalSessions, usedSessions, remainingSessions };
}

function getStaffName(profile: ProfileRow | null | undefined) {
  return profile?.full_name || profile?.email || "-";
}

function getStatusLabel(value: string | null | undefined) {
  return value || "-";
}

function getDaysUntil(value: string | null | undefined) {
  if (!value) return null;

  const today = new Date();
  const deadline = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return null;

  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function makeProfileMap(profiles: ProfileRow[]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function makeClientMap(clients: ClientRow[]) {
  return new Map(clients.map((client) => [client.id, client]));
}

function buildClientExportRows(data: ReportData): ClientExportRow[] {
  const profileMap = makeProfileMap(data.profiles);

  return data.clients.map((client) => {
    const clientPackages = data.packages.filter((packageRow) => packageRow.client_id === client.id);
    const clientPurchases = data.purchases.filter((purchase) => purchase.client_id === client.id);
    const latestPackage = getLatestByDate(clientPackages);
    const latestPurchase = getLatestByDate(clientPurchases);
    const numbers = getPackageNumbers(latestPackage);
    const packageValue = toNumber(latestPackage?.package_value) ?? toNumber(latestPurchase?.price);
    const amountPaid = toNumber(latestPurchase?.amount_paid);
    const balanceDue = toNumber(latestPurchase?.balance_due);
    const pt = client.assigned_trainer_id ? profileMap.get(client.assigned_trainer_id) : null;
    const nc = client.assigned_nutrition_coach_id
      ? profileMap.get(client.assigned_nutrition_coach_id)
      : null;

    return {
      clientCode: client.client_code || "-",
      fullName: client.full_name || "-",
      email: client.email || "",
      phone: client.phone || "",
      status: getStatusLabel(client.status),
      source: getClientSourceLabel(client.client_source, client.client_source_other),
      personalTrainer: getStaffName(pt),
      nutritionCoach: getStaffName(nc),
      packageName: latestPackage?.package_name || latestPurchase?.plan_name || "-",
      startDate: formatDate(latestPackage?.starts_at),
      expireDate: formatDate(latestPackage?.expires_at),
      totalSessions: numbers.totalSessions,
      usedSessions: numbers.usedSessions,
      remainingSessions: numbers.remainingSessions,
      packageValue,
      latestPurchaseType: getPurchaseTypeLabel(latestPurchase?.purchase_type),
      amountPaid,
      balanceDue,
      debtDeadline: formatDate(latestPurchase?.debt_deadline),
      createdAt: formatDate(client.created_at),
    };
  });
}

function buildHtmlTable(headers: string[], rows: unknown[][], emptyText: string) {
  if (rows.length === 0) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${row
                    .map((cell, index) => {
                      const isNumber =
                        typeof cell === "number" ||
                        String(cell).startsWith("$") ||
                        String(cell).startsWith("-$");

                      return `<td class="${isNumber && index > 0 ? "right" : ""}">${escapeHtml(cell)}</td>`;
                    })
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildMoneyBarChart(
  rows: { label: string; value: number; tone?: "good" | "bad" | "warn" | "blue" }[],
  emptyText: string
) {
  if (rows.length === 0) return `<div class="empty">${escapeHtml(emptyText)}</div>`;

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return `
    <div class="bar-chart">
      ${rows
        .map((row) => {
          const width = Math.max((Math.abs(row.value) / max) * 100, 3);
          const tone = row.tone || (row.value >= 0 ? "good" : "bad");

          return `
            <div class="bar-row">
              <div class="bar-label">${escapeHtml(row.label)}</div>
              <div class="bar-track"><div class="bar-fill ${tone}" style="width:${width}%"></div></div>
              <div class="bar-value ${tone}">${escapeHtml(money(row.value))}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildCountBarChart(
  rows: { label: string; value: number; tone?: "good" | "bad" | "warn" | "blue" }[],
  emptyText: string
) {
  if (rows.length === 0) return `<div class="empty">${escapeHtml(emptyText)}</div>`;

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return `
    <div class="bar-chart">
      ${rows
        .map((row) => {
          const width = Math.max((Math.abs(row.value) / max) * 100, 3);
          const tone = row.tone || "blue";

          return `
            <div class="bar-row">
              <div class="bar-label">${escapeHtml(row.label)}</div>
              <div class="bar-track"><div class="bar-fill ${tone}" style="width:${width}%"></div></div>
              <div class="bar-value ${tone}">${escapeHtml(row.value)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildTrendRows(
  range: PeriodRange,
  transactions: BusinessTransaction[],
  sessions: SessionHistoryRow[]
) {
  const start = new Date(`${range.startDate}T12:00:00`);
  const end = new Date(`${range.endDateExclusive}T12:00:00`);
  const dayCount = Math.max(Math.round((end.getTime() - start.getTime()) / 86400000), 1);
  const useMonths = dayCount > 62;
  const bucketMap = new Map<string, { label: string; income: number; expenses: number; sessions: number }>();

  const ensureBucket = (dateKey: string) => {
    const key = useMonths ? dateKey.slice(0, 7) : dateKey;
    const label = useMonths
      ? new Date(`${key}-01T00:00:00`).toLocaleDateString("en-CA", {
          year: "numeric",
          month: "short",
        })
      : new Date(`${key}T00:00:00`).toLocaleDateString("en-CA", {
          month: "short",
          day: "numeric",
        });

    if (!bucketMap.has(key)) {
      bucketMap.set(key, { label, income: 0, expenses: 0, sessions: 0 });
    }

    return bucketMap.get(key)!;
  };

  if (useMonths) {
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const finish = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor < finish) {
      ensureBucket(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-01`);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  } else {
    let cursor = range.startDate;
    while (cursor < range.endDateExclusive) {
      ensureBucket(cursor);
      cursor = addDays(cursor, 1);
    }
  }

  transactions.forEach((transaction) => {
    const dateKey = getDateKey(transaction.transaction_date);
    if (!dateKey) return;

    const bucket = ensureBucket(dateKey);
    const amount = toNumber(transaction.amount) ?? 0;

    if (transaction.transaction_type === "income") bucket.income += amount;
    if (transaction.transaction_type === "expense") bucket.expenses += amount;
  });

  sessions.forEach((session) => {
    if (session.status !== "success") return;

    const dateKey = getDateKey(session.created_at);
    if (!dateKey) return;

    ensureBucket(dateKey).sessions += 1;
  });

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

function buildActivityChart(
  rows: { label: string; income: number; expenses: number; sessions: number }[]
) {
  if (rows.length === 0) return `<div class="empty">No activity in this period.</div>`;

  const maxMoney = Math.max(...rows.flatMap((row) => [row.income, row.expenses]), 1);
  const maxSessions = Math.max(...rows.map((row) => row.sessions), 1);

  return `
    <div class="activity-chart">
      ${rows
        .map((row) => {
          const incomeHeight = Math.max((row.income / maxMoney) * 100, row.income > 0 ? 5 : 0);
          const expenseHeight = Math.max((row.expenses / maxMoney) * 100, row.expenses > 0 ? 5 : 0);
          const sessionHeight = Math.max((row.sessions / maxSessions) * 100, row.sessions > 0 ? 5 : 0);

          return `
            <div class="activity-item" title="${escapeHtml(row.label)} | Income ${escapeHtml(
              money(row.income)
            )} | Expenses ${escapeHtml(money(row.expenses))} | Sessions ${escapeHtml(row.sessions)}">
              <div class="activity-bars">
                <div class="activity-bar income" style="height:${incomeHeight}%"></div>
                <div class="activity-bar expense" style="height:${expenseHeight}%"></div>
                <div class="activity-bar session" style="height:${sessionHeight}%"></div>
              </div>
              <div class="activity-label">${escapeHtml(row.label)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="legend">
      <span><b class="legend-income"></b> Income</span>
      <span><b class="legend-expense"></b> Expenses</span>
      <span><b class="legend-session"></b> Completed sessions</span>
    </div>
  `;
}

function buildReportStyles() {
  return `
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      background: #eef1f5;
      color: #172033;
      font-family: Arial, "Segoe UI", Helvetica, sans-serif;
      line-height: 1.45;
    }
    .page { max-width: 1240px; margin: 0 auto; padding: 28px; }
    .report { overflow: hidden; border: 1px solid #dce1e8; border-radius: 22px; background: white; box-shadow: 0 22px 70px rgba(15, 23, 42, .11); }
    .hero { padding: 32px 36px; border-bottom: 6px solid #f3c71b; background: #111827; color: white; }
    .brand { color: #facc15; font-size: 12px; font-weight: 800; letter-spacing: .28em; text-transform: uppercase; }
    h1 { margin: 10px 0 0; font-size: 40px; line-height: 1.08; letter-spacing: -.035em; }
    .hero p { margin: 10px 0 0; color: #cbd5e1; }
    .section { padding: 27px 34px; border-bottom: 1px solid #e5e7eb; }
    .section-title { margin: 0 0 15px; font-size: 21px; font-weight: 800; letter-spacing: -.02em; }
    .section-subtitle { margin: -7px 0 17px; color: #667085; font-size: 13px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }
    .card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; background: #f8fafc; }
    .label { font-size: 10px; font-weight: 800; letter-spacing: .09em; color: #667085; text-transform: uppercase; }
    .value { margin-top: 8px; font-size: 27px; line-height: 1.05; font-weight: 850; letter-spacing: -.03em; }
    .sub { margin-top: 6px; color: #667085; font-size: 12px; }
    .good { color: #047857; }
    .bad { color: #c2413b; }
    .warn { color: #b45309; }
    .blue { color: #1d4ed8; }
    .neutral { color: #172033; }
    .bar-chart { display: grid; gap: 10px; }
    .bar-row { display: grid; grid-template-columns: 190px 1fr 115px; gap: 12px; align-items: center; }
    .bar-label { font-size: 13px; font-weight: 700; color: #344054; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { height: 16px; border: 1px solid #e2e8f0; border-radius: 999px; background: #f1f5f9; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; }
    .bar-fill.good { background: #16a34a; }
    .bar-fill.bad { background: #dc2626; }
    .bar-fill.warn { background: #d97706; }
    .bar-fill.blue { background: #2563eb; }
    .bar-value { text-align: right; font-size: 13px; font-weight: 800; white-space: nowrap; }
    .activity-chart { display: flex; gap: 7px; align-items: end; min-height: 220px; padding: 18px 12px 8px; border: 1px solid #e2e8f0; border-radius: 17px; background: #f8fafc; overflow-x: auto; }
    .activity-item { display: flex; min-width: 38px; height: 190px; flex: 1 0 38px; flex-direction: column; justify-content: end; align-items: center; gap: 7px; }
    .activity-bars { display: flex; align-items: end; justify-content: center; gap: 3px; width: 100%; height: 156px; }
    .activity-bar { width: 8px; border-radius: 4px 4px 0 0; }
    .activity-bar.income { background: #16a34a; }
    .activity-bar.expense { background: #dc2626; }
    .activity-bar.session { background: #eab308; }
    .activity-label { max-width: 62px; color: #667085; font-size: 9px; text-align: center; white-space: nowrap; }
    .legend { display: flex; flex-wrap: wrap; gap: 15px; margin-top: 11px; color: #667085; font-size: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend b { display: inline-block; width: 10px; height: 10px; border-radius: 999px; }
    .legend-income { background: #16a34a; }
    .legend-expense { background: #dc2626; }
    .legend-session { background: #eab308; }
    .table-wrap { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { padding: 10px; background: #172033; color: white; text-align: left; font-size: 10px; letter-spacing: .065em; text-transform: uppercase; white-space: nowrap; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .right { text-align: right; white-space: nowrap; }
    .empty { padding: 20px; border: 1px dashed #cbd5e1; border-radius: 16px; color: #667085; background: #f8fafc; text-align: center; }
    .footer { padding: 17px 34px; background: #f8fafc; color: #667085; font-size: 12px; }
    .page-break { page-break-before: always; }
    @media (max-width: 900px) {
      .grid-4, .grid-3 { grid-template-columns: 1fr 1fr; }
      .bar-row { grid-template-columns: 125px 1fr 85px; }
      .page { padding: 12px; }
    }
    @media print {
      body { background: white; }
      .page { max-width: none; padding: 0; }
      .report { border: none; border-radius: 0; box-shadow: none; }
      .section { break-inside: avoid; }
    }
  `;
}

function buildBusinessReportHtml(args: {
  range: PeriodRange;
  generatedAt: string;
  data: ReportData;
}) {
  const { data, range } = args;
  const clientMap = makeClientMap(data.clients);
  const clientExportRows = buildClientExportRows(data);

  const incomeTransactions = data.transactions.filter((row) => row.transaction_type === "income");
  const expenseTransactions = data.transactions.filter((row) => row.transaction_type === "expense");
  const adjustmentTransactions = data.transactions.filter(
    (row) => row.transaction_type === "cash_adjustment"
  );

  const income = incomeTransactions.reduce((sum, row) => sum + (toNumber(row.amount) ?? 0), 0);
  const expenses = expenseTransactions.reduce(
    (sum, row) => sum + (toNumber(row.amount) ?? 0),
    0
  );
  const adjustments = adjustmentTransactions.reduce(
    (sum, row) => sum + (toNumber(row.amount) ?? 0),
    0
  );
  const netCash = income + adjustments - expenses;
  const completedSessions = data.sessions.filter((row) => row.status === "success");
  const newClients = data.clients.filter((client) => isDateInRange(client.created_at, range)).length;
  const activeClients = data.clients.filter(
    (client) => String(client.status || "").toLowerCase() === "active"
  ).length;
  const allRemainingSessions = clientExportRows.reduce(
    (sum, row) => sum + row.remainingSessions,
    0
  );

  const debtRows = data.purchases
    .map((purchase) => {
      const balanceDue = toNumber(purchase.balance_due) ?? 0;
      if (balanceDue <= 0) return null;

      const client = clientMap.get(purchase.client_id);
      const daysLeft = getDaysUntil(purchase.debt_deadline);

      return {
        clientCode: client?.client_code || "-",
        clientName: client?.full_name || "Unknown Client",
        planName: purchase.plan_name || "Unpaid Balance",
        balanceDue,
        deadline: purchase.debt_deadline,
        daysLeft,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const totalOutstandingDebt = debtRows.reduce((sum, row) => sum + row.balanceDue, 0);
  const overdueDebt = debtRows.filter((row) => row.daysLeft !== null && row.daysLeft < 0);
  const dueSoonDebt = debtRows.filter(
    (row) => row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 7
  );

  const lowSessionRows = clientExportRows
    .filter((row) => row.remainingSessions > 0 && row.remainingSessions <= 10)
    .sort((a, b) => a.remainingSessions - b.remainingSessions)
    .slice(0, 30);

  const sourceMap = new Map<
    string,
    { income: number; expenses: number; adjustments: number; net: number }
  >();

  data.transactions.forEach((transaction) => {
    const source = transaction.source || "manual";
    const current = sourceMap.get(source) || {
      income: 0,
      expenses: 0,
      adjustments: 0,
      net: 0,
    };
    const amount = toNumber(transaction.amount) ?? 0;

    if (transaction.transaction_type === "income") {
      current.income += amount;
      current.net += amount;
    }

    if (transaction.transaction_type === "expense") {
      current.expenses += amount;
      current.net -= amount;
    }

    if (transaction.transaction_type === "cash_adjustment") {
      current.adjustments += amount;
      current.net += amount;
    }

    sourceMap.set(source, current);
  });

  const sourceRows = Array.from(sourceMap.entries())
    .map(([source, totals]) => ({ source, label: getSourceLabel(source), ...totals }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const trendRows = buildTrendRows(range, data.transactions, data.sessions);

  const sourceTableRows = sourceRows.map((row) => [
    row.label,
    money(row.income),
    money(row.expenses),
    money(row.adjustments),
    money(row.net),
  ]);

  const debtTableRows = debtRows.slice(0, 60).map((row) => [
    row.clientCode,
    row.clientName,
    row.planName,
    money(row.balanceDue),
    formatDate(row.deadline),
    row.daysLeft === null
      ? "No deadline"
      : row.daysLeft < 0
        ? `Overdue by ${Math.abs(row.daysLeft)} days`
        : `Due in ${row.daysLeft} days`,
  ]);

  const renewalRows = lowSessionRows.map((row) => [
    row.clientCode,
    row.fullName,
    row.packageName,
    row.remainingSessions,
    row.personalTrainer,
    row.nutritionCoach,
  ]);

  const transactionRows = data.transactions.map((transaction) => [
    formatDate(transaction.transaction_date),
    getTransactionTypeLabel(transaction.transaction_type),
    getSourceLabel(transaction.source),
    transaction.title || "-",
    transaction.transaction_type === "expense"
      ? `-${money(transaction.amount)}`
      : money(transaction.amount),
    transaction.notes || "",
  ]);

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FXA FITNESS Business Report - ${escapeHtml(range.label)}</title>
  <style>${buildReportStyles()}</style>
</head>
<body>
  <main class="page">
    <article class="report">
      <header class="hero">
        <div class="brand">FXA FITNESS</div>
        <h1>Business Report</h1>
        <p>${escapeHtml(range.label)} · Generated ${escapeHtml(args.generatedAt)}</p>
      </header>

      <section class="section">
        <h2 class="section-title">Business Summary</h2>
        <div class="grid-4">
          <div class="card"><div class="label">Income Collected</div><div class="value good">${escapeHtml(money(income))}</div><div class="sub">Income recorded during this period</div></div>
          <div class="card"><div class="label">Expenses Paid</div><div class="value bad">${escapeHtml(money(expenses))}</div><div class="sub">Expenses recorded during this period</div></div>
          <div class="card"><div class="label">Net Cash</div><div class="value ${netCash >= 0 ? "good" : "bad"}">${escapeHtml(money(netCash))}</div><div class="sub">Income + adjustments - expenses</div></div>
          <div class="card"><div class="label">Outstanding Client Debt</div><div class="value warn">${escapeHtml(money(totalOutstandingDebt))}</div><div class="sub">Current unpaid client balances</div></div>
        </div>
        <div style="height:13px"></div>
        <div class="grid-4">
          <div class="card"><div class="label">New Clients</div><div class="value blue">${escapeHtml(newClients)}</div><div class="sub">Clients created during this period</div></div>
          <div class="card"><div class="label">Active Clients</div><div class="value neutral">${escapeHtml(activeClients)}</div><div class="sub">Current active client records</div></div>
          <div class="card"><div class="label">Completed Sessions</div><div class="value blue">${escapeHtml(completedSessions.length)}</div><div class="sub">Successful session history records</div></div>
          <div class="card"><div class="label">Sessions Remaining</div><div class="value warn">${escapeHtml(allRemainingSessions)}</div><div class="sub">Current total across client packages</div></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Income, Expenses and Sessions</h2>
        <p class="section-subtitle">The chart uses daily buckets for shorter periods and monthly buckets for longer periods.</p>
        ${buildActivityChart(trendRows)}
      </section>

      <section class="section">
        <h2 class="section-title">Financial Activity by Source</h2>
        ${buildMoneyBarChart(
          sourceRows.slice(0, 12).map((row) => ({
            label: row.label,
            value: row.net,
            tone: row.net >= 0 ? "good" : "bad",
          })),
          "No financial activity was found for this period."
        )}
        <div style="height:18px"></div>
        ${buildHtmlTable(
          ["Source", "Income", "Expenses", "Adjustments", "Net"],
          sourceTableRows,
          "No source breakdown is available."
        )}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Debt Follow-Up</h2>
        <div class="grid-3">
          <div class="card"><div class="label">Outstanding Balance</div><div class="value warn">${escapeHtml(money(totalOutstandingDebt))}</div><div class="sub">All current unpaid balances</div></div>
          <div class="card"><div class="label">Overdue Records</div><div class="value bad">${escapeHtml(overdueDebt.length)}</div><div class="sub">Payment deadline has passed</div></div>
          <div class="card"><div class="label">Due Within 7 Days</div><div class="value warn">${escapeHtml(dueSoonDebt.length)}</div><div class="sub">Requires near-term follow-up</div></div>
        </div>
        <div style="height:18px"></div>
        ${buildHtmlTable(
          ["Client Code", "Client", "Record", "Balance", "Deadline", "Status"],
          debtTableRows,
          "No outstanding client debt was found."
        )}
      </section>

      <section class="section">
        <h2 class="section-title">Renewal Follow-Up</h2>
        ${buildHtmlTable(
          ["Client Code", "Client", "Package", "Remaining", "PT", "Nutrition Coach"],
          renewalRows,
          "No clients currently have 1 to 10 sessions remaining."
        )}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Transaction Detail</h2>
        ${buildHtmlTable(
          ["Date", "Type", "Source", "Description", "Amount", "Notes"],
          transactionRows,
          "No transactions were found for this period."
        )}
      </section>

      <footer class="footer">FXA FITNESS · Business Report · ${escapeHtml(range.label)}</footer>
    </article>
  </main>
</body>
</html>
  `.trim();
}

function buildSessionReportHtml(args: {
  range: PeriodRange;
  generatedAt: string;
  sessions: SessionHistoryRow[];
  clients: ClientRow[];
  profiles: ProfileRow[];
  selectedStaffName: string;
  statusLabel: string;
}) {
  const clientMap = makeClientMap(args.clients);
  const profileMap = makeProfileMap(args.profiles);
  const successful = args.sessions.filter((row) => row.status === "success");
  const failed = args.sessions.filter((row) => row.status === "failed");
  const cancelled = args.sessions.filter((row) => row.status === "cancelled");
  const uniqueClients = new Set(args.sessions.map((row) => row.client_id).filter(Boolean)).size;
  const completionRate = args.sessions.length > 0 ? (successful.length / args.sessions.length) * 100 : 0;

  const staffMap = new Map<
    string,
    { name: string; total: number; success: number; failed: number; cancelled: number; clients: Set<string> }
  >();

  args.sessions.forEach((session) => {
    const staffId = session.trainer_id || "manual";
    const staff = session.trainer_id ? profileMap.get(session.trainer_id) : null;
    const current = staffMap.get(staffId) || {
      name: staff ? getStaffName(staff) : "Admin / Manual",
      total: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
      clients: new Set<string>(),
    };

    current.total += 1;
    if (session.status === "success") current.success += 1;
    if (session.status === "failed") current.failed += 1;
    if (session.status === "cancelled") current.cancelled += 1;
    if (session.client_id) current.clients.add(session.client_id);

    staffMap.set(staffId, current);
  });

  const staffRows = Array.from(staffMap.values()).sort((a, b) => b.success - a.success);
  const trendRows = buildTrendRows(args.range, [], args.sessions);

  const staffTableRows = staffRows.map((row) => [
    row.name,
    row.total,
    row.success,
    row.failed,
    row.cancelled,
    row.clients.size,
    percent(row.total > 0 ? (row.success / row.total) * 100 : 0),
  ]);

  const detailRows = args.sessions.map((session) => {
    const client = session.client_id ? clientMap.get(session.client_id) : null;
    const staff = session.trainer_id ? profileMap.get(session.trainer_id) : null;

    return [
      formatDateTime(session.created_at),
      client?.client_code || "-",
      client?.full_name || "Unknown Client",
      staff ? getStaffName(staff) : "Admin / Manual",
      getStatusLabel(session.status),
      session.remaining_after ?? "",
      session.trainer_note || session.message || "",
    ];
  });

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FXA FITNESS Session Report - ${escapeHtml(args.range.label)}</title>
  <style>${buildReportStyles()}</style>
</head>
<body>
  <main class="page">
    <article class="report">
      <header class="hero">
        <div class="brand">FXA FITNESS</div>
        <h1>Session Report</h1>
        <p>${escapeHtml(args.range.label)} · PT / Coach: ${escapeHtml(args.selectedStaffName)} · Status: ${escapeHtml(args.statusLabel)} · Generated ${escapeHtml(args.generatedAt)}</p>
      </header>

      <section class="section">
        <h2 class="section-title">Session Summary</h2>
        <div class="grid-4">
          <div class="card"><div class="label">Total Session Records</div><div class="value neutral">${escapeHtml(args.sessions.length)}</div><div class="sub">All records matching the selected filters</div></div>
          <div class="card"><div class="label">Completed Sessions / Shows</div><div class="value good">${escapeHtml(successful.length)}</div><div class="sub">Successful session records</div></div>
          <div class="card"><div class="label">Failed or Cancelled</div><div class="value bad">${escapeHtml(failed.length + cancelled.length)}</div><div class="sub">Records requiring review</div></div>
          <div class="card"><div class="label">Completion Rate</div><div class="value blue">${escapeHtml(percent(completionRate))}</div><div class="sub">Completed divided by total records</div></div>
        </div>
        <div style="height:13px"></div>
        <div class="grid-3">
          <div class="card"><div class="label">Unique Clients</div><div class="value neutral">${escapeHtml(uniqueClients)}</div><div class="sub">Clients appearing in this report</div></div>
          <div class="card"><div class="label">Selected PT / Coach</div><div class="value blue" style="font-size:20px">${escapeHtml(args.selectedStaffName)}</div><div class="sub">Use the filter on the report page to isolate one staff member</div></div>
          <div class="card"><div class="label">Status Filter</div><div class="value neutral" style="font-size:20px">${escapeHtml(args.statusLabel)}</div><div class="sub">Current session status filter</div></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Session Activity</h2>
        <p class="section-subtitle">Yellow bars show completed sessions. Longer periods are grouped by month.</p>
        ${buildActivityChart(trendRows)}
      </section>

      <section class="section">
        <h2 class="section-title">PT / Coach Performance</h2>
        ${buildCountBarChart(
          staffRows.slice(0, 20).map((row) => ({
            label: row.name,
            value: row.success,
            tone: "blue",
          })),
          "No PT or coach session records were found."
        )}
        <div style="height:18px"></div>
        ${buildHtmlTable(
          ["PT / Coach", "Total", "Completed", "Failed", "Cancelled", "Unique Clients", "Completion Rate"],
          staffTableRows,
          "No PT or coach performance data was found."
        )}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Session Detail</h2>
        ${buildHtmlTable(
          ["Date / Time", "Client Code", "Client", "PT / Coach", "Status", "Remaining After", "Note"],
          detailRows,
          "No sessions match the selected filters."
        )}
      </section>

      <footer class="footer">FXA FITNESS · Session Report · ${escapeHtml(args.range.label)}</footer>
    </article>
  </main>
</body>
</html>
  `.trim();
}

function PeriodFields(props: {
  mode: PeriodMode;
  setMode: (mode: PeriodMode) => void;
  year: number;
  setYear: (year: number) => void;
  month: number;
  setMonth: (month: number) => void;
  customStart: string;
  setCustomStart: (value: string) => void;
  customEnd: string;
  setCustomEnd: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Period</span>
        <select
          value={props.mode}
          onChange={(event) => props.setMode(event.target.value as PeriodMode)}
          className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
        >
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="custom">Custom period</option>
        </select>
      </label>

      {props.mode === "month" || props.mode === "year" ? (
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Year</span>
          <input
            type="number"
            value={props.year}
            min={2000}
            max={2100}
            onChange={(event) => props.setYear(Number(event.target.value))}
            className="w-full rounded-xl border border-yellow-500/30 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
          />
        </label>
      ) : null}

      {props.mode === "month" ? (
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Month</span>
          <select
            value={props.month}
            onChange={(event) => props.setMonth(Number(event.target.value))}
            className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
          >
            {MONTH_OPTIONS.map((monthName, index) => (
              <option key={monthName} value={index + 1}>
                {pad(index + 1)} - {monthName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {props.mode === "custom" ? (
        <>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Start date</span>
            <input
              type="date"
              value={props.customStart}
              onChange={(event) => props.setCustomStart(event.target.value)}
              className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">End date</span>
            <input
              type="date"
              value={props.customEnd}
              onChange={(event) => props.setCustomEnd(event.target.value)}
              className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

export default function AdminReportsPage() {
  const router = useRouter();
  const now = new Date();
  const currentDate = dateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const currentMonthStart = dateString(now.getFullYear(), now.getMonth() + 1, 1);

  const [checkingRole, setCheckingRole] = useState(true);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ReportType | null>(null);
  const [error, setError] = useState("");
  const [staffProfiles, setStaffProfiles] = useState<ProfileRow[]>([]);

  const [businessMode, setBusinessMode] = useState<PeriodMode>("month");
  const [businessYear, setBusinessYear] = useState(now.getFullYear());
  const [businessMonth, setBusinessMonth] = useState(now.getMonth() + 1);
  const [businessStart, setBusinessStart] = useState(currentMonthStart);
  const [businessEnd, setBusinessEnd] = useState(currentDate);

  const [sessionMode, setSessionMode] = useState<PeriodMode>("month");
  const [sessionYear, setSessionYear] = useState(now.getFullYear());
  const [sessionMonth, setSessionMonth] = useState(now.getMonth() + 1);
  const [sessionStart, setSessionStart] = useState(currentMonthStart);
  const [sessionEnd, setSessionEnd] = useState(currentDate);
  const [sessionStaffId, setSessionStaffId] = useState("all");
  const [sessionStatus, setSessionStatus] = useState<SessionStatusFilter>("all");
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [loadingSessionSummary, setLoadingSessionSummary] = useState(false);

  const [clientMode, setClientMode] = useState<ClientPeriodMode>("all");
  const [clientYear, setClientYear] = useState(now.getFullYear());
  const [clientMonth, setClientMonth] = useState(now.getMonth() + 1);
  const [clientStart, setClientStart] = useState(currentMonthStart);
  const [clientEnd, setClientEnd] = useState(currentDate);

  const businessRangeState = useMemo(
    () =>
      getPeriodRange(
        businessMode,
        businessYear,
        businessMonth,
        businessStart,
        businessEnd
      ),
    [businessMode, businessYear, businessMonth, businessStart, businessEnd]
  );

  const sessionRangeState = useMemo(
    () =>
      getPeriodRange(sessionMode, sessionYear, sessionMonth, sessionStart, sessionEnd),
    [sessionMode, sessionYear, sessionMonth, sessionStart, sessionEnd]
  );

  const clientRangeState = useMemo(() => {
    if (clientMode === "all") {
      return { range: null, error: "" } as PeriodRangeState;
    }

    return getPeriodRange(clientMode, clientYear, clientMonth, clientStart, clientEnd);
  }, [clientMode, clientYear, clientMonth, clientStart, clientEnd]);

  const isManager = currentRole === "manager";
  const staffOptions = useMemo(
    () =>
      staffProfiles
        .filter((profile) => ["trainer", "nutrition_coach"].includes(String(profile.role)))
        .sort((a, b) => getStaffName(a).localeCompare(getStaffName(b))),
    [staffProfiles]
  );

  const selectedStaffName =
    sessionStaffId === "all"
      ? "All PTs and coaches"
      : getStaffName(staffProfiles.find((profile) => profile.id === sessionStaffId));

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role === "admin" || role === "manager") {
        setCurrentRole(role);

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["trainer", "nutrition_coach", "admin", "manager"])
          .order("full_name", { ascending: true });

        if (profileError) {
          console.error(profileError);
        } else {
          setStaffProfiles((data || []) as ProfileRow[]);
        }

        setCheckingRole(false);
        return;
      }

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
    }

    protectPage();
  }, [router]);

  async function fetchTransactions(range: PeriodRange) {
    const { data, error: fetchError } = await supabase
      .from("business_transactions")
      .select("id, transaction_type, source, title, amount, notes, transaction_date, created_at")
      .gte("transaction_date", range.startDate)
      .lt("transaction_date", range.endDateExclusive)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    return (data || []) as BusinessTransaction[];
  }

  async function fetchSessions(
    range: PeriodRange,
    staffId = "all",
    status: SessionStatusFilter = "all"
  ) {
    let query = supabase
      .from("session_history")
      .select("id, client_id, trainer_id, status, message, trainer_note, remaining_after, created_at")
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso);

    if (staffId !== "all") query = query.eq("trainer_id", staffId);
    if (status !== "all") query = query.eq("status", status);

    const { data, error: fetchError } = await query.order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    return (data || []) as SessionHistoryRow[];
  }

  async function fetchClients(range?: PeriodRange | null) {
    let query = supabase
      .from("clients")
      .select(
        "id, client_code, full_name, email, phone, gender, status, client_source, client_source_other, assigned_trainer_id, assigned_nutrition_coach_id, created_at"
      );

    if (range) {
      query = query.gte("created_at", range.startIso).lt("created_at", range.endIso);
    }

    const { data, error: fetchError } = await query.order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    return (data || []) as ClientRow[];
  }

  async function fetchPackages() {
    const { data, error: fetchError } = await supabase
      .from("session_packages")
      .select(
        "id, client_id, package_name, total_sessions, used_sessions, remaining_sessions, package_value, status, starts_at, expires_at, created_at"
      )
      .order("created_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);
    return (data || []) as SessionPackageRow[];
  }

  async function fetchPurchases() {
    const { data, error: fetchError } = await supabase
      .from("client_purchases")
      .select(
        "id, client_id, plan_name, session_count, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);
    return (data || []) as ClientPurchaseRow[];
  }

  async function fetchProfiles() {
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["trainer", "nutrition_coach", "admin", "manager"])
      .order("full_name", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    return (data || []) as ProfileRow[];
  }

  async function fetchBusinessReportData(range: PeriodRange): Promise<ReportData> {
    const [transactions, sessions, clients, packages, purchases, profiles] = await Promise.all([
      fetchTransactions(range),
      fetchSessions(range),
      fetchClients(),
      fetchPackages(),
      fetchPurchases(),
      fetchProfiles(),
    ]);

    return { transactions, sessions, clients, packages, purchases, profiles };
  }

  useEffect(() => {
    if (checkingRole || !sessionRangeState.range) {
      setSessionSummary(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSessionSummary(true);

      try {
        const sessions = await fetchSessions(
          sessionRangeState.range!,
          sessionStaffId,
          sessionStatus
        );

        if (!cancelled) {
          setSessionSummary({
            total: sessions.length,
            success: sessions.filter((row) => row.status === "success").length,
            failed: sessions.filter((row) => row.status === "failed").length,
            cancelled: sessions.filter((row) => row.status === "cancelled").length,
            uniqueClients: new Set(sessions.map((row) => row.client_id).filter(Boolean)).size,
          });
        }
      } catch (summaryError) {
        console.error(summaryError);
        if (!cancelled) setSessionSummary(null);
      } finally {
        if (!cancelled) setLoadingSessionSummary(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    checkingRole,
    sessionRangeState.range?.startIso,
    sessionRangeState.range?.endIso,
    sessionStaffId,
    sessionStatus,
  ]);

  async function exportBusinessHtml() {
    setError("");

    if (!businessRangeState.range) {
      setError(businessRangeState.error);
      return;
    }

    setDownloading("business-html");

    try {
      const data = await fetchBusinessReportData(businessRangeState.range);
      const html = buildBusinessReportHtml({
        range: businessRangeState.range,
        generatedAt: new Date().toLocaleString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        data,
      });

      downloadFile(
        `FXA-Business-Report-${businessRangeState.range.fileLabel}.html`,
        html,
        "text/html;charset=utf-8;"
      );
    } catch (exportError) {
      console.error(exportError);
      setError(exportError instanceof Error ? exportError.message : "Business report export failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function exportBusinessCsv() {
    setError("");

    if (!businessRangeState.range) {
      setError(businessRangeState.error);
      return;
    }

    setDownloading("business-csv");

    try {
      const rows = await fetchTransactions(businessRangeState.range);

      downloadCsv(
        `FXA-Transactions-${businessRangeState.range.fileLabel}.csv`,
        ["Date", "Type", "Source", "Description", "Amount", "Notes", "Created At"],
        rows.map((row) => [
          row.transaction_date,
          getTransactionTypeLabel(row.transaction_type),
          getSourceLabel(row.source),
          row.title || "",
          row.amount ?? 0,
          row.notes || "",
          formatDateTime(row.created_at),
        ])
      );
    } catch (exportError) {
      console.error(exportError);
      setError(exportError instanceof Error ? exportError.message : "Transaction CSV export failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function exportSessionHtml() {
    setError("");

    if (!sessionRangeState.range) {
      setError(sessionRangeState.error);
      return;
    }

    setDownloading("session-html");

    try {
      const [sessions, clients, profiles] = await Promise.all([
        fetchSessions(sessionRangeState.range, sessionStaffId, sessionStatus),
        fetchClients(),
        fetchProfiles(),
      ]);

      const html = buildSessionReportHtml({
        range: sessionRangeState.range,
        generatedAt: new Date().toLocaleString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        sessions,
        clients,
        profiles,
        selectedStaffName,
        statusLabel: sessionStatus === "all" ? "All statuses" : getStatusLabel(sessionStatus),
      });

      const staffFileLabel =
        sessionStaffId === "all"
          ? "all-staff"
          : selectedStaffName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "staff";

      downloadFile(
        `FXA-Session-Report-${sessionRangeState.range.fileLabel}-${staffFileLabel}.html`,
        html,
        "text/html;charset=utf-8;"
      );
    } catch (exportError) {
      console.error(exportError);
      setError(exportError instanceof Error ? exportError.message : "Session report export failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function exportSessionCsv() {
    setError("");

    if (!sessionRangeState.range) {
      setError(sessionRangeState.error);
      return;
    }

    setDownloading("session-csv");

    try {
      const [sessions, clients, profiles] = await Promise.all([
        fetchSessions(sessionRangeState.range, sessionStaffId, sessionStatus),
        fetchClients(),
        fetchProfiles(),
      ]);
      const clientMap = makeClientMap(clients);
      const profileMap = makeProfileMap(profiles);

      downloadCsv(
        `FXA-Sessions-${sessionRangeState.range.fileLabel}.csv`,
        [
          "Date / Time",
          "Client Code",
          "Client Name",
          "PT / Coach",
          "Status",
          "Remaining After",
          "Message",
          "Trainer Note",
        ],
        sessions.map((session) => {
          const client = session.client_id ? clientMap.get(session.client_id) : null;
          const trainer = session.trainer_id ? profileMap.get(session.trainer_id) : null;

          return [
            formatDateTime(session.created_at),
            client?.client_code || "-",
            client?.full_name || "Unknown Client",
            trainer ? getStaffName(trainer) : "Admin / Manual",
            session.status,
            session.remaining_after ?? "",
            session.message || "",
            session.trainer_note || "",
          ];
        })
      );
    } catch (exportError) {
      console.error(exportError);
      setError(exportError instanceof Error ? exportError.message : "Session CSV export failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function exportClientsCsv() {
    setError("");

    if (clientMode !== "all" && !clientRangeState.range) {
      setError(clientRangeState.error);
      return;
    }

    setDownloading("clients");

    try {
      const [clients, packages, purchases, profiles] = await Promise.all([
        fetchClients(clientMode === "all" ? null : clientRangeState.range),
        fetchPackages(),
        fetchPurchases(),
        fetchProfiles(),
      ]);

      const rows = buildClientExportRows({
        transactions: [],
        sessions: [],
        clients,
        packages,
        purchases,
        profiles,
      });

      const fileLabel = clientMode === "all" ? "all-clients" : clientRangeState.range!.fileLabel;

      downloadCsv(
        `FXA-Clients-${fileLabel}.csv`,
        [
          "Client Code",
          "Full Name",
          "Email",
          "Phone",
          "Status",
          "Source",
          "Personal Trainer",
          "Nutrition Coach",
          "Package",
          "Start Date",
          "Expire Date",
          "Total Sessions",
          "Used Sessions",
          "Remaining Sessions",
          "Package Value",
          "Latest Purchase Type",
          "Amount Paid",
          "Balance Due",
          "Debt Deadline",
          "Created At",
        ],
        rows.map((row) => [
          row.clientCode,
          row.fullName,
          row.email,
          row.phone,
          row.status,
          row.source,
          row.personalTrainer,
          row.nutritionCoach,
          row.packageName,
          row.startDate,
          row.expireDate,
          row.totalSessions,
          row.usedSessions,
          row.remainingSessions,
          row.packageValue ?? "",
          row.latestPurchaseType,
          row.amountPaid ?? "",
          row.balanceDue ?? "",
          row.debtDeadline,
          row.createdAt,
        ])
      );
    } catch (exportError) {
      console.error(exportError);
      setError(exportError instanceof Error ? exportError.message : "Client report export failed.");
    } finally {
      setDownloading(null);
    }
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="text-sm font-semibold text-yellow-400">Checking report access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 rounded-3xl border border-yellow-500/25 bg-black/55 p-5 shadow-2xl md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">FXA FITNESS</p>
                <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">Reports</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400 md:text-base">
                  Export a focused business report, a filtered PT session report, or a client directory report.
                </p>

                {isManager ? (
                  <p className="mt-3 text-sm text-yellow-100">
                    Manager access allows report viewing and export. Financial editing remains admin-only.
                  </p>
                ) : null}
              </div>

              <Link
                href="/admin"
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                Back to Admin
              </Link>
            </div>
          </header>

          {error ? (
            <div className="mb-5 whitespace-pre-wrap rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-6">
            <section className="rounded-[2rem] border border-yellow-500/25 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">01</p>
                  <h2 className="mt-2 text-2xl font-semibold">Business Report</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Financial summary, cash activity, debt follow-up, renewal follow-up and transaction detail.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-gray-300">
                  {businessRangeState.range?.label || "Select a valid period"}
                </div>
              </div>

              <PeriodFields
                mode={businessMode}
                setMode={setBusinessMode}
                year={businessYear}
                setYear={setBusinessYear}
                month={businessMonth}
                setMonth={setBusinessMonth}
                customStart={businessStart}
                setCustomStart={setBusinessStart}
                customEnd={businessEnd}
                setCustomEnd={setBusinessEnd}
              />

              {businessRangeState.error ? (
                <p className="mt-3 text-sm text-red-300">{businessRangeState.error}</p>
              ) : null}

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-yellow-400/35 bg-yellow-400/[0.08] p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-yellow-400">
                        Summary Report
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">Business Overview</h3>
                      <p className="mt-1 text-sm leading-5 text-gray-400">
                        Financial summary, charts, debt follow-up and transaction details in one print-ready file.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-300">
                      HTML / PDF
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={exportBusinessHtml}
                    disabled={downloading !== null}
                    className="flex w-full items-center justify-between rounded-xl bg-yellow-400 px-5 py-3.5 text-left text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{downloading === "business-html" ? "Exporting report..." : "Export Business Report"}</span>
                    <span aria-hidden="true" className="text-lg">→</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-blue-400/30 bg-blue-400/[0.07] p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
                        Income & Expense Data
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">Transaction Export</h3>
                      <p className="mt-1 text-sm leading-5 text-gray-400">
                        A clean spreadsheet-ready list of income, expenses and cash adjustments for the selected period.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200">
                      CSV / Excel
                    </span>
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide">
                    <span className="rounded-lg border border-green-400/20 bg-green-400/10 px-2 py-2 text-green-300">Income</span>
                    <span className="rounded-lg border border-red-400/20 bg-red-400/10 px-2 py-2 text-red-300">Expense</span>
                    <span className="rounded-lg border border-gray-400/20 bg-white/5 px-2 py-2 text-gray-300">Adjustment</span>
                  </div>

                  <button
                    type="button"
                    onClick={exportBusinessCsv}
                    disabled={downloading !== null}
                    className="flex w-full items-center justify-between rounded-xl border border-blue-300/70 bg-blue-400/10 px-5 py-3.5 text-left text-sm font-semibold text-blue-100 transition hover:bg-blue-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{downloading === "business-csv" ? "Exporting transactions..." : "Export Income & Expense CSV"}</span>
                    <span aria-hidden="true" className="text-lg">↓</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-yellow-500/25 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">02</p>
                  <h2 className="mt-2 text-2xl font-semibold">Session Report</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Filter by period, PT or coach, and session status. The report shows completed session count, client count and staff performance.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-gray-300">
                  {sessionRangeState.range?.label || "Select a valid period"}
                </div>
              </div>

              <PeriodFields
                mode={sessionMode}
                setMode={setSessionMode}
                year={sessionYear}
                setYear={setSessionYear}
                month={sessionMonth}
                setMonth={setSessionMonth}
                customStart={sessionStart}
                setCustomStart={setSessionStart}
                customEnd={sessionEnd}
                setCustomEnd={setSessionEnd}
              />

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">PT / Coach</span>
                  <select
                    value={sessionStaffId}
                    onChange={(event) => setSessionStaffId(event.target.value)}
                    className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                  >
                    <option value="all">All PTs and coaches</option>
                    {staffOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {getStaffName(profile)}{profile.role === "nutrition_coach" ? " - Nutrition Coach" : " - PT"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Session status</span>
                  <select
                    value={sessionStatus}
                    onChange={(event) => setSessionStatus(event.target.value as SessionStatusFilter)}
                    className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                  >
                    <option value="all">All statuses</option>
                    <option value="success">Completed only</option>
                    <option value="failed">Failed only</option>
                    <option value="cancelled">Cancelled only</option>
                  </select>
                </label>
              </div>

              {sessionRangeState.error ? (
                <p className="mt-3 text-sm text-red-300">{sessionRangeState.error}</p>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500">Total</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {loadingSessionSummary ? "..." : sessionSummary?.total ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500">Completed / Shows</p>
                  <p className="mt-2 text-2xl font-semibold text-green-400">
                    {loadingSessionSummary ? "..." : sessionSummary?.success ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500">Failed</p>
                  <p className="mt-2 text-2xl font-semibold text-red-300">
                    {loadingSessionSummary ? "..." : sessionSummary?.failed ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500">Cancelled</p>
                  <p className="mt-2 text-2xl font-semibold text-orange-300">
                    {loadingSessionSummary ? "..." : sessionSummary?.cancelled ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500">Clients</p>
                  <p className="mt-2 text-2xl font-semibold text-blue-300">
                    {loadingSessionSummary ? "..." : sessionSummary?.uniqueClients ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={exportSessionHtml}
                  disabled={downloading !== null}
                  className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading === "session-html" ? "Exporting..." : "Export Session Report"}
                </button>
                <button
                  type="button"
                  onClick={exportSessionCsv}
                  disabled={downloading !== null}
                  className="rounded-xl border border-yellow-400 px-5 py-3 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading === "session-csv" ? "Exporting..." : "Export Session CSV"}
                </button>
              </div>
            </section>

            <section className="rounded-[2rem] border border-yellow-500/25 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">03</p>
                  <h2 className="mt-2 text-2xl font-semibold">Client Report</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Keep the full client directory export, or limit it to clients created in a selected year, month or custom period.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-gray-300">
                  {clientMode === "all"
                    ? "All clients"
                    : clientRangeState.range?.label || "Select a valid period"}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Client scope</span>
                  <select
                    value={clientMode}
                    onChange={(event) => setClientMode(event.target.value as ClientPeriodMode)}
                    className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                  >
                    <option value="all">All clients</option>
                    <option value="year">Created in a year</option>
                    <option value="month">Created in a month</option>
                    <option value="custom">Created in a custom period</option>
                  </select>
                </label>

                {clientMode === "month" || clientMode === "year" ? (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Year</span>
                    <input
                      type="number"
                      value={clientYear}
                      min={2000}
                      max={2100}
                      onChange={(event) => setClientYear(Number(event.target.value))}
                      className="w-full rounded-xl border border-yellow-500/30 bg-black px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                    />
                  </label>
                ) : null}

                {clientMode === "month" ? (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Month</span>
                    <select
                      value={clientMonth}
                      onChange={(event) => setClientMonth(Number(event.target.value))}
                      className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                    >
                      {MONTH_OPTIONS.map((monthName, index) => (
                        <option key={monthName} value={index + 1}>
                          {pad(index + 1)} - {monthName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {clientMode === "custom" ? (
                  <>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Start date</span>
                      <input
                        type="date"
                        value={clientStart}
                        onChange={(event) => setClientStart(event.target.value)}
                        className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">End date</span>
                      <input
                        type="date"
                        value={clientEnd}
                        onChange={(event) => setClientEnd(event.target.value)}
                        className="w-full rounded-xl border border-yellow-500/30 bg-white px-4 py-3 text-sm text-black outline-none focus:border-yellow-400"
                      />
                    </label>
                  </>
                ) : null}
              </div>

              {clientRangeState.error ? (
                <p className="mt-3 text-sm text-red-300">{clientRangeState.error}</p>
              ) : null}

              <div className="mt-5">
                <button
                  type="button"
                  onClick={exportClientsCsv}
                  disabled={downloading !== null}
                  className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading === "clients" ? "Exporting..." : "Export Client CSV"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
