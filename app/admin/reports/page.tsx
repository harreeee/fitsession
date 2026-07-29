"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ReportType = "full-html" | "revenue" | "sessions" | "clients";

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

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: `${MONTH_OPTIONS[month - 1]} ${year}`,
    fileLabel: `${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    lastDay,
  };
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const cleanValue = Number(value);

  if (Number.isNaN(cleanValue)) return null;

  return cleanValue;
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

function isDateInRange(value: string | null | undefined, startIso: string, endIso: string) {
  const time = getTime(value);

  return time >= getTime(startIso) && time < getTime(endIso);
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

  return labels[source] || source.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
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
  const remainingSessions = savedRemaining !== null ? savedRemaining : Math.max(totalSessions - usedSessions, 0);

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
    const nc = client.assigned_nutrition_coach_id ? profileMap.get(client.assigned_nutrition_coach_id) : null;

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
                    const isNumber = typeof cell === "number" || String(cell).startsWith("$") || String(cell).startsWith("-");
                    return `<td class="${isNumber && index > 0 ? "right" : ""}">${escapeHtml(cell)}</td>`;
                  })
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildBarChart(rows: { label: string; value: number; tone?: "good" | "bad" | "warn" | "blue" }[], emptyText: string) {
  if (rows.length === 0) return `<div class="empty">${escapeHtml(emptyText)}</div>`;

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return `
    <div class="bar-chart">
      ${rows
        .map((row) => {
          const width = Math.max((Math.abs(row.value) / max) * 100, 4);
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

function buildCountBarChart(rows: { label: string; value: number; tone?: "good" | "bad" | "warn" | "blue" }[], emptyText: string) {
  if (rows.length === 0) return `<div class="empty">${escapeHtml(emptyText)}</div>`;

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return `
    <div class="bar-chart">
      ${rows
        .map((row) => {
          const width = Math.max((Math.abs(row.value) / max) * 100, 4);
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

function buildDailyGraph(rows: { day: string; revenue: number; sessions: number }[]) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
  const maxSessions = Math.max(...rows.map((row) => row.sessions), 1);

  return `
    <div class="daily-grid">
      ${rows
        .map((row) => {
          const revenueHeight = Math.max((row.revenue / maxRevenue) * 100, row.revenue > 0 ? 6 : 0);
          const sessionHeight = Math.max((row.sessions / maxSessions) * 100, row.sessions > 0 ? 6 : 0);

          return `
            <div class="daily-item" title="${escapeHtml(row.day)} · Revenue ${escapeHtml(money(row.revenue))} · Sessions ${escapeHtml(row.sessions)}">
              <div class="daily-bars">
                <div class="daily-bar revenue" style="height:${revenueHeight}%"></div>
                <div class="daily-bar session" style="height:${sessionHeight}%"></div>
              </div>
              <div class="daily-label">${escapeHtml(row.day)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="legend"><span><b class="legend-revenue"></b> Revenue</span><span><b class="legend-session"></b> Sessions</span></div>
  `;
}

function buildFullHtmlReport(args: {
  monthLabel: string;
  fileLabel: string;
  year: number;
  month: number;
  lastDay: number;
  startIso: string;
  endIso: string;
  generatedAt: string;
  data: ReportData;
}) {
  const { data } = args;
  const clientMap = makeClientMap(data.clients);
  const profileMap = makeProfileMap(data.profiles);
  const clientExportRows = buildClientExportRows(data);

  const incomeTransactions = data.transactions.filter((row) => row.transaction_type === "income");
  const expenseTransactions = data.transactions.filter((row) => row.transaction_type === "expense");
  const adjustmentTransactions = data.transactions.filter((row) => row.transaction_type === "cash_adjustment");

  const income = incomeTransactions.reduce((sum, row) => sum + (toNumber(row.amount) ?? 0), 0);
  const expenses = expenseTransactions.reduce((sum, row) => sum + (toNumber(row.amount) ?? 0), 0);
  const adjustments = adjustmentTransactions.reduce((sum, row) => sum + (toNumber(row.amount) ?? 0), 0);
  const net = income + adjustments - expenses;

  const successSessions = data.sessions.filter((row) => row.status === "success");
  const failedSessions = data.sessions.filter((row) => row.status === "failed");
  const cancelledSessions = data.sessions.filter((row) => row.status === "cancelled");
  const uniqueClientSessions = new Set(data.sessions.map((row) => row.client_id).filter(Boolean)).size;
  const uniqueTrainerSessions = new Set(data.sessions.map((row) => row.trainer_id).filter(Boolean)).size;
  const completionRate = data.sessions.length > 0 ? (successSessions.length / data.sessions.length) * 100 : 0;

  const activeClients = data.clients.filter((client) => String(client.status || "").toLowerCase() === "active").length;
  const inactiveClients = data.clients.filter((client) => String(client.status || "").toLowerCase() === "inactive").length;
  const newClientsThisMonth = data.clients.filter((client) => isDateInRange(client.created_at, args.startIso, args.endIso)).length;

  const allRemainingSessions = clientExportRows.reduce((sum, row) => sum + row.remainingSessions, 0);
  const allUsedSessions = clientExportRows.reduce((sum, row) => sum + row.usedSessions, 0);
  const allPackageValue = clientExportRows.reduce((sum, row) => sum + (row.packageValue || 0), 0);
  const totalOutstandingDebt = data.purchases.reduce((sum, purchase) => sum + Math.max(toNumber(purchase.balance_due) ?? 0, 0), 0);

  const debtRows = data.purchases
    .map((purchase) => {
      const balanceDue = toNumber(purchase.balance_due) ?? 0;
      if (balanceDue <= 0) return null;

      const client = clientMap.get(purchase.client_id);
      const daysLeft = getDaysUntil(purchase.debt_deadline);

      return {
        clientCode: client?.client_code || "-",
        clientName: client?.full_name || "Unknown Client",
        planName: purchase.plan_name || "Debt / Unpaid Balance",
        balanceDue,
        deadline: purchase.debt_deadline,
        daysLeft,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const overdueDebt = debtRows.filter((row) => row.daysLeft !== null && row.daysLeft < 0);
  const dueSoonDebt = debtRows.filter((row) => row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 7);

  const lowSessionRows = clientExportRows
    .filter((row) => row.remainingSessions > 0 && row.remainingSessions <= 10)
    .sort((a, b) => a.remainingSessions - b.remainingSessions)
    .slice(0, 20);

  const expiredOrZeroRows = clientExportRows
    .filter((row) => row.remainingSessions <= 0 || String(row.status).toLowerCase() === "inactive")
    .sort((a, b) => a.remainingSessions - b.remainingSessions)
    .slice(0, 20);

  const purchaseRowsThisMonth = data.purchases
    .filter((purchase) => isDateInRange(purchase.created_at, args.startIso, args.endIso))
    .filter((purchase) => ["new", "renew", "renewal"].includes(String(purchase.purchase_type || "").toLowerCase()))
    .sort((a, b) => getTime(b.created_at) - getTime(a.created_at));

  const sourceMap = new Map<string, { income: number; expenses: number; adjustments: number; net: number }>();

  data.transactions.forEach((transaction) => {
    const source = transaction.source || "manual";
    const current = sourceMap.get(source) || { income: 0, expenses: 0, adjustments: 0, net: 0 };
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

  const trainerMap = new Map<string, { name: string; sessions: number; success: number; notes: number }>();

  data.sessions.forEach((session) => {
    const trainerId = session.trainer_id || "manual";
    const trainer = session.trainer_id ? profileMap.get(session.trainer_id) : null;
    const name = trainer ? getStaffName(trainer) : "Admin / Manual";
    const current = trainerMap.get(trainerId) || { name, sessions: 0, success: 0, notes: 0 };

    current.sessions += 1;
    if (session.status === "success") current.success += 1;
    if (session.trainer_note) current.notes += 1;

    trainerMap.set(trainerId, current);
  });

  const trainerRows = Array.from(trainerMap.values()).sort((a, b) => b.success - a.success);

  const dailyRows = Array.from({ length: args.lastDay }).map((_, index) => {
    const day = index + 1;
    const dayKey = `${args.year}-${String(args.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayLabel = String(day);
    const dayRevenue = incomeTransactions
      .filter((transaction) => transaction.transaction_date?.slice(0, 10) === dayKey)
      .reduce((sum, transaction) => sum + (toNumber(transaction.amount) ?? 0), 0);
    const daySessions = successSessions.filter((session) => session.created_at?.slice(0, 10) === dayKey).length;

    return {
      day: dayLabel,
      revenue: dayRevenue,
      sessions: daySessions,
    };
  });

  const transactionTableRows = data.transactions.map((transaction) => [
    formatDate(transaction.transaction_date),
    getTransactionTypeLabel(transaction.transaction_type),
    getSourceLabel(transaction.source),
    transaction.title || "-",
    transaction.transaction_type === "expense" ? `-${money(transaction.amount)}` : money(transaction.amount),
    transaction.notes || "",
  ]);

  const sessionTableRows = data.sessions.slice(0, 300).map((session) => {
    const client = session.client_id ? clientMap.get(session.client_id) : null;
    const trainer = session.trainer_id ? profileMap.get(session.trainer_id) : null;

    return [
      formatDateTime(session.created_at),
      client?.client_code || "-",
      client?.full_name || "Unknown Client",
      getStaffName(trainer || null) || "Admin / Manual",
      session.status,
      session.remaining_after ?? "",
      session.trainer_note || session.message || "",
    ];
  });

  const debtTableRows = debtRows.slice(0, 50).map((row) => [
    row.clientCode,
    row.clientName,
    row.planName,
    money(row.balanceDue),
    formatDate(row.deadline),
    row.daysLeft === null ? "No deadline" : row.daysLeft < 0 ? `Overdue ${Math.abs(row.daysLeft)} days` : `Due in ${row.daysLeft} days`,
  ]);

  const lowSessionTableRows = lowSessionRows.map((row) => [
    row.clientCode,
    row.fullName,
    row.packageName,
    row.remainingSessions,
    row.personalTrainer,
    row.nutritionCoach,
  ]);

  const purchaseTableRows = purchaseRowsThisMonth.map((purchase) => {
    const client = clientMap.get(purchase.client_id);

    return [
      formatDate(purchase.created_at),
      client?.client_code || "-",
      client?.full_name || "Unknown Client",
      purchase.plan_name || "-",
      getPurchaseTypeLabel(purchase.purchase_type),
      purchase.session_count ?? "",
      money(purchase.price),
      money(purchase.amount_paid),
      money(purchase.balance_due),
    ];
  });

  const clientTableRows = clientExportRows.map((row) => [
    row.clientCode,
    row.fullName,
    row.status,
    row.personalTrainer,
    row.nutritionCoach,
    row.packageName,
    row.totalSessions,
    row.usedSessions,
    row.remainingSessions,
    money(row.packageValue),
    money(row.balanceDue),
    row.debtDeadline,
    row.source,
  ]);

  const sourceTableRows = sourceRows.map((row) => [
    row.label,
    money(row.income),
    money(row.expenses),
    money(row.adjustments),
    money(row.net),
  ]);

  const statusChartRows = [
    { label: "Active", value: activeClients, tone: "good" as const },
    { label: "Inactive", value: inactiveClients, tone: "bad" as const },
    { label: "New this month", value: newClientsThisMonth, tone: "blue" as const },
  ];

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FXA FITNESS Full Business Report - ${escapeHtml(args.monthLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      background: #f4f4f5;
      color: #111827;
      font-family: Arial, "Segoe UI", "Noto Sans", Helvetica, sans-serif;
      line-height: 1.45;
    }
    .page { max-width: 1280px; margin: 0 auto; padding: 28px; }
    .report { overflow: hidden; border: 1px solid #e5e7eb; border-radius: 28px; background: #fff; box-shadow: 0 24px 80px rgba(0,0,0,0.10); }
    .hero { padding: 34px; border-bottom: 8px solid #facc15; background: radial-gradient(circle at top left, rgba(250,204,21,.22), transparent 36%), linear-gradient(135deg, #050505, #171717 62%, #050505); color: white; }
    .brand { color: #facc15; font-size: 12px; font-weight: 900; letter-spacing: .32em; text-transform: uppercase; }
    h1 { margin: 10px 0 0; font-size: 42px; line-height: 1.05; letter-spacing: -.04em; }
    .hero p { margin: 10px 0 0; color: #d4d4d8; }
    .section { padding: 28px 34px; border-bottom: 1px solid #e5e7eb; }
    .section-title { margin: 0 0 16px; font-size: 21px; font-weight: 900; letter-spacing: -.02em; }
    .section-subtitle { margin: -8px 0 18px; color: #6b7280; font-size: 13px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .card { border: 1px solid #e5e7eb; border-radius: 20px; padding: 17px; background: #fafafa; }
    .label { font-size: 11px; font-weight: 900; letter-spacing: .10em; color: #6b7280; text-transform: uppercase; }
    .value { margin-top: 8px; font-size: 28px; line-height: 1.05; font-weight: 950; letter-spacing: -.03em; }
    .sub { margin-top: 6px; color: #6b7280; font-size: 12px; }
    .good { color: #047857; }
    .bad { color: #dc2626; }
    .warn { color: #d97706; }
    .blue { color: #2563eb; }
    .neutral { color: #111827; }
    .bar-chart { display: grid; gap: 11px; }
    .bar-row { display: grid; grid-template-columns: 190px 1fr 110px; gap: 12px; align-items: center; }
    .bar-label { font-size: 13px; font-weight: 800; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { height: 18px; border: 1px solid #e5e7eb; border-radius: 999px; background: #f3f4f6; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; }
    .bar-fill.good { background: linear-gradient(90deg, #facc15, #22c55e); }
    .bar-fill.bad { background: linear-gradient(90deg, #fb7185, #dc2626); }
    .bar-fill.warn { background: linear-gradient(90deg, #facc15, #f97316); }
    .bar-fill.blue { background: linear-gradient(90deg, #38bdf8, #2563eb); }
    .bar-value { text-align: right; font-size: 13px; font-weight: 900; white-space: nowrap; }
    .daily-grid { display: grid; grid-template-columns: repeat(${args.lastDay}, minmax(16px, 1fr)); gap: 5px; align-items: end; height: 190px; padding: 16px 8px 8px; border: 1px solid #e5e7eb; border-radius: 20px; background: #fafafa; }
    .daily-item { display: flex; min-width: 0; height: 100%; flex-direction: column; justify-content: end; align-items: center; gap: 5px; }
    .daily-bars { display: flex; align-items: end; justify-content: center; gap: 2px; height: 145px; width: 100%; }
    .daily-bar { width: 6px; min-height: 0; border-radius: 999px 999px 0 0; }
    .daily-bar.revenue { background: #22c55e; }
    .daily-bar.session { background: #facc15; }
    .daily-label { color: #71717a; font-size: 9px; }
    .legend { display: flex; gap: 14px; margin-top: 10px; color: #6b7280; font-size: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend b { display: inline-block; width: 10px; height: 10px; border-radius: 999px; }
    .legend-revenue { background: #22c55e; }
    .legend-session { background: #facc15; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { padding: 10px; background: #111827; color: #facc15; text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .right { text-align: right; white-space: nowrap; }
    .empty { padding: 18px; border: 1px dashed #d1d5db; border-radius: 18px; color: #6b7280; background: #fafafa; text-align: center; }
    .warning-box { border: 1px solid #f59e0b33; background: #fffbeb; color: #92400e; border-radius: 18px; padding: 14px; font-size: 13px; }
    .footer { padding: 18px 34px; background: #fafafa; color: #6b7280; font-size: 12px; }
    .page-break { page-break-before: always; }
    @media (max-width: 900px) { .grid-4, .grid-3 { grid-template-columns: 1fr 1fr; } .bar-row { grid-template-columns: 120px 1fr 82px; } .page { padding: 12px; } }
    @media print { body { background: white; } .page { max-width: none; padding: 0; } .report { border-radius: 0; box-shadow: none; border: none; } .section { break-inside: avoid; } }
  </style>
</head>
<body>
  <main class="page">
    <article class="report">
      <header class="hero">
        <div class="brand">FXA FITNESS</div>
        <h1>Full Business Report</h1>
        <p>${escapeHtml(args.monthLabel)} · Generated ${escapeHtml(args.generatedAt)} · UTF-8 / Vietnamese-safe export</p>
      </header>

      <section class="section">
        <h2 class="section-title">Executive Summary</h2>
        <div class="grid-4">
          <div class="card"><div class="label">Revenue Collected</div><div class="value good">${escapeHtml(money(income))}</div><div class="sub">Income transactions in selected month</div></div>
          <div class="card"><div class="label">Expenses</div><div class="value bad">${escapeHtml(money(expenses))}</div><div class="sub">Expense transactions in selected month</div></div>
          <div class="card"><div class="label">Net Cash</div><div class="value ${net >= 0 ? "good" : "bad"}">${escapeHtml(money(net))}</div><div class="sub">Income + adjustments - expenses</div></div>
          <div class="card"><div class="label">Outstanding Debt</div><div class="value warn">${escapeHtml(money(totalOutstandingDebt))}</div><div class="sub">All unpaid client balances</div></div>
        </div>
        <div style="height:14px"></div>
        <div class="grid-4">
          <div class="card"><div class="label">Total Clients</div><div class="value neutral">${escapeHtml(data.clients.length)}</div><div class="sub">All client records</div></div>
          <div class="card"><div class="label">Active Clients</div><div class="value good">${escapeHtml(activeClients)}</div><div class="sub">Status active</div></div>
          <div class="card"><div class="label">Completed Sessions</div><div class="value blue">${escapeHtml(successSessions.length)}</div><div class="sub">Successful scan/history rows</div></div>
          <div class="card"><div class="label">Sessions Remaining</div><div class="value warn">${escapeHtml(allRemainingSessions)}</div><div class="sub">All active package balances</div></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Daily Revenue and Session Graph</h2>
        <p class="section-subtitle">Green bars show daily revenue collected. Yellow bars show successful sessions.</p>
        ${buildDailyGraph(dailyRows)}
      </section>

      <section class="section">
        <h2 class="section-title">Revenue by Source</h2>
        ${buildBarChart(sourceRows.slice(0, 10).map((row) => ({ label: row.label, value: row.net, tone: row.net >= 0 ? "good" : "bad" })), "No revenue source activity in this month.")}
      </section>

      <section class="section">
        <h2 class="section-title">Source Breakdown</h2>
        ${buildHtmlTable(["Source", "Income", "Expenses", "Adjustments", "Net"], sourceTableRows, "No source breakdown available.")}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Session Performance</h2>
        <div class="grid-4">
          <div class="card"><div class="label">Total Logs</div><div class="value neutral">${escapeHtml(data.sessions.length)}</div><div class="sub">All session records this month</div></div>
          <div class="card"><div class="label">Success</div><div class="value good">${escapeHtml(successSessions.length)}</div><div class="sub">Completed sessions</div></div>
          <div class="card"><div class="label">Failed / Cancelled</div><div class="value bad">${escapeHtml(failedSessions.length + cancelledSessions.length)}</div><div class="sub">Failed + cancelled records</div></div>
          <div class="card"><div class="label">Completion Rate</div><div class="value blue">${escapeHtml(percent(completionRate))}</div><div class="sub">Success divided by all logs</div></div>
        </div>
        <div style="height:18px"></div>
        <div class="grid-3">
          <div class="card"><div class="label">Unique Clients</div><div class="value neutral">${escapeHtml(uniqueClientSessions)}</div><div class="sub">Clients trained this month</div></div>
          <div class="card"><div class="label">Unique Staff</div><div class="value neutral">${escapeHtml(uniqueTrainerSessions)}</div><div class="sub">Trainers / coaches with sessions</div></div>
          <div class="card"><div class="label">Used Sessions Total</div><div class="value warn">${escapeHtml(allUsedSessions)}</div><div class="sub">Current used sessions across clients</div></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Trainer / Coach Session Graph</h2>
        ${buildCountBarChart(trainerRows.slice(0, 12).map((row) => ({ label: row.name, value: row.success, tone: "blue" })), "No trainer sessions found for this month.")}
      </section>

      <section class="section">
        <h2 class="section-title">Client Management Snapshot</h2>
        <div class="grid-4">
          <div class="card"><div class="label">New Clients</div><div class="value blue">${escapeHtml(newClientsThisMonth)}</div><div class="sub">Created in selected month</div></div>
          <div class="card"><div class="label">Inactive Clients</div><div class="value bad">${escapeHtml(inactiveClients)}</div><div class="sub">Moved to inactive page</div></div>
          <div class="card"><div class="label">Low Sessions</div><div class="value warn">${escapeHtml(lowSessionRows.length)}</div><div class="sub">1-10 sessions remaining</div></div>
          <div class="card"><div class="label">Package Value</div><div class="value neutral">${escapeHtml(money(allPackageValue))}</div><div class="sub">From package/purchase records</div></div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Client Status Graph</h2>
        ${buildCountBarChart(statusChartRows, "No clients available.")}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Debt Follow-Up</h2>
        <div class="grid-3">
          <div class="card"><div class="label">Outstanding Debt</div><div class="value warn">${escapeHtml(money(totalOutstandingDebt))}</div><div class="sub">Total unpaid balance</div></div>
          <div class="card"><div class="label">Overdue Records</div><div class="value bad">${escapeHtml(overdueDebt.length)}</div><div class="sub">Deadline already passed</div></div>
          <div class="card"><div class="label">Due Soon</div><div class="value warn">${escapeHtml(dueSoonDebt.length)}</div><div class="sub">Due in 0-7 days</div></div>
        </div>
        <div style="height:18px"></div>
        ${buildHtmlTable(["Client Code", "Client", "Record", "Balance", "Deadline", "Notice"], debtTableRows, "No outstanding debt records.")}
      </section>

      <section class="section">
        <h2 class="section-title">Renewal Follow-Up</h2>
        ${buildHtmlTable(["Client Code", "Client", "Package", "Remaining", "PT", "NC"], lowSessionTableRows, "No clients with 1-10 sessions remaining.")}
      </section>

      <section class="section">
        <h2 class="section-title">Inactive / Zero-Session Watch</h2>
        ${buildHtmlTable(["Client Code", "Client", "Status", "Package", "Remaining", "Debt"], expiredOrZeroRows.map((row) => [row.clientCode, row.fullName, row.status, row.packageName, row.remainingSessions, money(row.balanceDue)]), "No inactive or zero-session clients in the current data.")}
      </section>

      <section class="section page-break">
        <h2 class="section-title">New / Renew Purchases This Month</h2>
        ${buildHtmlTable(["Date", "Client Code", "Client", "Plan", "Type", "Sessions", "Price", "Paid", "Balance"], purchaseTableRows, "No new/renew purchase records for this month.")}
      </section>

      <section class="section">
        <h2 class="section-title">Transaction Detail</h2>
        ${buildHtmlTable(["Date", "Type", "Source", "Title", "Amount", "Notes"], transactionTableRows, "No revenue transactions for this month.")}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Session Detail</h2>
        <p class="section-subtitle">Showing up to first 300 session rows in the exported report. Use Sessions CSV for the complete raw export.</p>
        ${buildHtmlTable(["Date / Time", "Client Code", "Client", "Staff", "Status", "Remaining", "Note / Message"], sessionTableRows, "No sessions for this month.")}
      </section>

      <section class="section page-break">
        <h2 class="section-title">Client Directory Snapshot</h2>
        <p class="section-subtitle">Use Clients CSV for the complete editable table.</p>
        ${buildHtmlTable(["Code", "Client", "Status", "PT", "NC", "Package", "Total", "Used", "Remaining", "Value", "Debt", "Debt Deadline", "Source"], clientTableRows, "No clients available.")}
      </section>

      <footer class="footer">
        FXA FITNESS report · ${escapeHtml(args.monthLabel)} · This file uses UTF-8 and safe fonts for Vietnamese text. Open in Chrome or Edge and Print to PDF when needed.
      </footer>
    </article>
  </main>
</body>
</html>
  `.trim();
}

export default function AdminReportsPage() {
  const router = useRouter();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [downloading, setDownloading] = useState<ReportType | null>(null);
  const [error, setError] = useState("");
  const [checkingRole, setCheckingRole] = useState(true);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const monthRange = useMemo(() => getMonthRange(year, month), [year, month]);
  const isManager = currentRole === "manager";

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role === "admin" || role === "manager") {
        setCurrentRole(role);
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

  async function fetchTransactions() {
    const { data, error: fetchError } = await supabase
      .from("business_transactions")
      .select("id, transaction_type, source, title, amount, notes, transaction_date, created_at")
      .gte("transaction_date", monthRange.startDate)
      .lt("transaction_date", monthRange.endDate)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);

    return (data || []) as BusinessTransaction[];
  }

  async function fetchSessions() {
    const { data, error: fetchError } = await supabase
      .from("session_history")
      .select("id, client_id, trainer_id, status, message, trainer_note, remaining_after, created_at")
      .gte("created_at", monthRange.startIso)
      .lt("created_at", monthRange.endIso)
      .order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);

    return (data || []) as SessionHistoryRow[];
  }

  async function fetchClients() {
    const { data, error: fetchError } = await supabase
      .from("clients")
      .select("id, client_code, full_name, email, phone, gender, status, client_source, client_source_other, assigned_trainer_id, assigned_nutrition_coach_id, created_at")
      .order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);

    return (data || []) as ClientRow[];
  }

  async function fetchPackages() {
    const { data, error: fetchError } = await supabase
      .from("session_packages")
      .select("id, client_id, package_name, total_sessions, used_sessions, remaining_sessions, package_value, status, starts_at, expires_at, created_at")
      .order("created_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);

    return (data || []) as SessionPackageRow[];
  }

  async function fetchPurchases() {
    const { data, error: fetchError } = await supabase
      .from("client_purchases")
      .select("id, client_id, plan_name, session_count, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at")
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

  async function fetchFullReportData(): Promise<ReportData> {
    const [transactions, sessions, clients, packages, purchases, profiles] = await Promise.all([
      fetchTransactions(),
      fetchSessions(),
      fetchClients(),
      fetchPackages(),
      fetchPurchases(),
      fetchProfiles(),
    ]);

    return { transactions, sessions, clients, packages, purchases, profiles };
  }

  async function exportFullHtmlReport() {
    setError("");
    setDownloading("full-html");

    try {
      const data = await fetchFullReportData();

      const html = buildFullHtmlReport({
        monthLabel: monthRange.label,
        fileLabel: monthRange.fileLabel,
        year: monthRange.year,
        month: monthRange.month,
        lastDay: monthRange.lastDay,
        startIso: monthRange.startIso,
        endIso: monthRange.endIso,
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
        `FXA-Full-Business-Report-${monthRange.fileLabel}.html`,
        html,
        "text/html;charset=utf-8;"
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Full report export failed.");
    }

    setDownloading(null);
  }

  async function downloadRevenueCsv() {
    setError("");
    setDownloading("revenue");

    try {
      const rows = await fetchTransactions();

      downloadCsv(
        `FXA-Revenue-${monthRange.fileLabel}.csv`,
        ["Date", "Type", "Source", "Title", "Amount", "Notes", "Created At"],
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
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Revenue CSV export failed.");
    }

    setDownloading(null);
  }

  async function downloadSessionsCsv() {
    setError("");
    setDownloading("sessions");

    try {
      const data = await fetchFullReportData();
      const clientMap = makeClientMap(data.clients);
      const profileMap = makeProfileMap(data.profiles);

      downloadCsv(
        `FXA-Sessions-${monthRange.fileLabel}.csv`,
        ["Date / Time", "Client Code", "Client Name", "Staff", "Status", "Remaining After", "Message", "Trainer Note"],
        data.sessions.map((session) => {
          const client = session.client_id ? clientMap.get(session.client_id) : null;
          const trainer = session.trainer_id ? profileMap.get(session.trainer_id) : null;

          return [
            formatDateTime(session.created_at),
            client?.client_code || "-",
            client?.full_name || "Unknown Client",
            getStaffName(trainer || null) || "Admin / Manual",
            session.status,
            session.remaining_after ?? "",
            session.message || "",
            session.trainer_note || "",
          ];
        })
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Sessions CSV export failed.");
    }

    setDownloading(null);
  }

  async function downloadClientsCsv() {
    setError("");
    setDownloading("clients");

    try {
      const data = await fetchFullReportData();
      const rows = buildClientExportRows(data);

      downloadCsv(
        `FXA-Clients-${monthRange.fileLabel}.csv`,
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
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Clients CSV export failed.");
    }

    setDownloading(null);
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
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-6 rounded-3xl border border-yellow-500/25 bg-black/55 p-5 shadow-2xl">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">FXA FITNESS</p>

                <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">Monthly Reports</h1>

                <p className="mt-3 text-sm font-normal text-gray-400 md:text-base">
                  Export a full business report with KPI cards, revenue graphs, session graphs, debt follow-up, renewal follow-up, purchase history, and client summary.
                </p>

                {isManager ? (
                  <p className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                    Manager view: reports are exportable, but editing finance records remains admin-only.
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

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">Year</span>
                <input
                  type="number"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black px-4 py-3 text-sm font-normal text-white outline-none transition focus:border-yellow-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">Month</span>
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-white px-4 py-3 text-sm font-normal text-black outline-none transition focus:border-yellow-400"
                >
                  {MONTH_OPTIONS.map((monthName, index) => (
                    <option key={monthName} value={index + 1}>
                      {String(index + 1).padStart(2, "0")} - {monthName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-black/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">Selected Period</p>
              <p className="mt-1 text-2xl font-semibold text-white">{monthRange.label}</p>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                The full report exports as an HTML file with safe UTF-8 encoding and print-friendly graphs. Open the file in Chrome/Edge, then print to PDF.
              </p>
            </div>

            {error ? (
              <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={exportFullHtmlReport}
                disabled={downloading !== null}
                className="rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "full-html" ? "Exporting..." : "Full Business Report"}
              </button>

              <button
                type="button"
                onClick={downloadRevenueCsv}
                disabled={downloading !== null}
                className="rounded-2xl border border-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "revenue" ? "Exporting..." : "Revenue CSV"}
              </button>

              <button
                type="button"
                onClick={downloadSessionsCsv}
                disabled={downloading !== null}
                className="rounded-2xl border border-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "sessions" ? "Exporting..." : "Sessions CSV"}
              </button>

              <button
                type="button"
                onClick={downloadClientsCsv}
                disabled={downloading !== null}
                className="rounded-2xl border border-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "clients" ? "Exporting..." : "Clients CSV"}
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="font-semibold text-yellow-300">Full Business Report</h3>
                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Includes executive summary, revenue graph, source breakdown, session graph, trainer performance, debt follow-up, renewal follow-up, purchases, transactions, and client directory snapshot.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="font-semibold text-yellow-300">Vietnamese-Safe Export</h3>
                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  HTML uses UTF-8 and safe system fonts. CSV exports include UTF-8 BOM so Excel can read Vietnamese accents better.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="font-semibold text-yellow-300">No API Dependency</h3>
                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Reports export directly from Supabase on this page, so broken API routes should not block your reports.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
