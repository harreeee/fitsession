"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ReportType = "revenue" | "sessions" | "clients";

type BusinessTransaction = {
  id: string;
  transaction_type: "income" | "expense" | "cash_adjustment";
  source: string;
  title: string;
  amount: number;
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

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: `${MONTH_OPTIONS[month - 1]} ${year}`,
    fileLabel: `${year}-${String(month).padStart(2, "0")}`,
  };
}

function money(value: number | null | undefined) {
  const cleanValue = Number(value || 0);

  return `$${cleanValue.toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

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

function cleanCsvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], {
    type,
  });

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
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getLatestByDate<T extends { created_at: string | null }>(rows: T[]) {
  if (rows.length === 0) return null;

  return [...rows].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

    return bTime - aTime;
  })[0];
}

function getTransactionTypeLabel(type: string) {
  if (type === "income") return "Income";
  if (type === "expense") return "Expense";
  if (type === "cash_adjustment") return "Cash Adjustment";
  return type;
}

function getSourceLabel(source: string | null | undefined) {
  if (!source) return "Manual";

  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildRevenueHtmlReport(args: {
  monthLabel: string;
  generatedAt: string;
  transactions: BusinessTransaction[];
}) {
  const income = args.transactions
    .filter((row) => row.transaction_type === "income")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const expenses = args.transactions
    .filter((row) => row.transaction_type === "expense")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const adjustments = args.transactions
    .filter((row) => row.transaction_type === "cash_adjustment")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const net = income + adjustments - expenses;

  const sourceMap = new Map<
    string,
    {
      income: number;
      expenses: number;
      adjustments: number;
      net: number;
    }
  >();

  for (const row of args.transactions) {
    const key = row.source || "manual";

    const current = sourceMap.get(key) || {
      income: 0,
      expenses: 0,
      adjustments: 0,
      net: 0,
    };

    if (row.transaction_type === "income") {
      current.income += Number(row.amount || 0);
      current.net += Number(row.amount || 0);
    }

    if (row.transaction_type === "expense") {
      current.expenses += Number(row.amount || 0);
      current.net -= Number(row.amount || 0);
    }

    if (row.transaction_type === "cash_adjustment") {
      current.adjustments += Number(row.amount || 0);
      current.net += Number(row.amount || 0);
    }

    sourceMap.set(key, current);
  }

  const sourceRows = Array.from(sourceMap.entries())
    .map(([source, totals]) => ({
      source,
      label: getSourceLabel(source),
      ...totals,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const maxSourceAmount = Math.max(
    ...sourceRows.map((row) => Math.abs(row.net)),
    1
  );

  const chartRows = sourceRows
    .slice(0, 8)
    .map((row) => {
      const width = Math.max((Math.abs(row.net) / maxSourceAmount) * 100, 4);

      return `
        <div class="chart-row">
          <div class="chart-label">${escapeHtml(row.label)}</div>
          <div class="chart-track">
            <div class="chart-bar ${row.net >= 0 ? "positive" : "negative"}" style="width:${width}%"></div>
          </div>
          <div class="chart-value ${row.net >= 0 ? "good" : "bad"}">${escapeHtml(money(row.net))}</div>
        </div>
      `;
    })
    .join("");

  const sourceTableRows = sourceRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td class="right good">${escapeHtml(money(row.income))}</td>
          <td class="right bad">${escapeHtml(money(row.expenses))}</td>
          <td class="right blue">${escapeHtml(money(row.adjustments))}</td>
          <td class="right ${row.net >= 0 ? "good" : "bad"}">${escapeHtml(money(row.net))}</td>
        </tr>
      `
    )
    .join("");

  const transactionRows = args.transactions
    .map((row) => {
      const amountClass =
        row.transaction_type === "expense"
          ? "bad"
          : row.transaction_type === "cash_adjustment"
            ? "blue"
            : "good";

      const prefix = row.transaction_type === "expense" ? "-" : "+";

      return `
        <tr>
          <td>${escapeHtml(formatDate(row.transaction_date))}</td>
          <td>${escapeHtml(getTransactionTypeLabel(row.transaction_type))}</td>
          <td>${escapeHtml(getSourceLabel(row.source))}</td>
          <td>
            <strong>${escapeHtml(row.title)}</strong>
            ${
              row.notes
                ? `<div class="note">${escapeHtml(row.notes)}</div>`
                : ""
            }
          </td>
          <td class="right ${amountClass}">${prefix}${escapeHtml(money(row.amount))}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FXA FITNESS Revenue Report - ${escapeHtml(args.monthLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f4f5;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
    }
    .page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px;
    }
    .report {
      overflow: hidden;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      background: white;
      box-shadow: 0 20px 60px rgba(0,0,0,0.08);
    }
    .header {
      padding: 30px;
      border-bottom: 6px solid #facc15;
      background: linear-gradient(135deg, #050505, #171717);
      color: white;
    }
    .brand {
      color: #facc15;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .28em;
      text-transform: uppercase;
    }
    h1 {
      margin: 8px 0 0;
      font-size: 38px;
      line-height: 1.1;
    }
    .subtitle {
      margin-top: 10px;
      color: #d1d5db;
      font-size: 14px;
    }
    .section {
      padding: 26px 30px;
      border-bottom: 1px solid #e5e7eb;
    }
    .section-title {
      margin: 0 0 14px;
      font-size: 20px;
      font-weight: 800;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    .kpi {
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 16px;
      background: #fafafa;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      color: #6b7280;
      text-transform: uppercase;
    }
    .kpi-value {
      margin-top: 8px;
      font-size: 26px;
      font-weight: 900;
    }
    .good { color: #047857; }
    .bad { color: #dc2626; }
    .blue { color: #2563eb; }
    .chart {
      display: grid;
      gap: 12px;
    }
    .chart-row {
      display: grid;
      grid-template-columns: 180px 1fr 110px;
      gap: 12px;
      align-items: center;
    }
    .chart-label {
      font-size: 13px;
      font-weight: 700;
      color: #374151;
    }
    .chart-track {
      height: 18px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      background: #f3f4f6;
    }
    .chart-bar {
      height: 100%;
      border-radius: 999px;
    }
    .chart-bar.positive {
      background: linear-gradient(90deg, #facc15, #22c55e);
    }
    .chart-bar.negative {
      background: linear-gradient(90deg, #f97316, #ef4444);
    }
    .chart-value {
      text-align: right;
      font-size: 13px;
      font-weight: 800;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      padding: 11px;
      background: #111827;
      color: #facc15;
      text-align: left;
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    td {
      padding: 11px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .right {
      text-align: right;
      white-space: nowrap;
    }
    .note {
      margin-top: 4px;
      color: #6b7280;
      font-size: 12px;
    }
    .empty {
      padding: 18px;
      border: 1px dashed #d1d5db;
      border-radius: 18px;
      color: #6b7280;
      background: #fafafa;
      text-align: center;
    }
    .footer {
      padding: 18px 30px;
      background: #fafafa;
      color: #6b7280;
      font-size: 12px;
    }
    @media print {
      body { background: white; }
      .page { padding: 0; }
      .report { border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="report">
      <header class="header">
        <div class="brand">FXA FITNESS</div>
        <h1>Revenue Report</h1>
        <div class="subtitle">${escapeHtml(args.monthLabel)} · Generated ${escapeHtml(args.generatedAt)}</div>
      </header>

      <section class="section">
        <h2 class="section-title">Financial Snapshot</h2>
        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Income</div>
            <div class="kpi-value good">${escapeHtml(money(income))}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Expenses</div>
            <div class="kpi-value bad">${escapeHtml(money(expenses))}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Adjustments</div>
            <div class="kpi-value blue">${escapeHtml(money(adjustments))}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Net</div>
            <div class="kpi-value ${net >= 0 ? "good" : "bad"}">${escapeHtml(money(net))}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Source Performance Graph</h2>
        ${
          chartRows ||
          `<div class="empty">No revenue source activity for this month.</div>`
        }
      </section>

      <section class="section">
        <h2 class="section-title">Source Breakdown</h2>
        ${
          sourceTableRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th class="right">Income</th>
                    <th class="right">Expense</th>
                    <th class="right">Adjustment</th>
                    <th class="right">Net</th>
                  </tr>
                </thead>
                <tbody>${sourceTableRows}</tbody>
              </table>`
            : `<div class="empty">No source breakdown available.</div>`
        }
      </section>

      <section class="section">
        <h2 class="section-title">Transaction Detail</h2>
        ${
          transactionRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Details</th>
                    <th class="right">Amount</th>
                  </tr>
                </thead>
                <tbody>${transactionRows}</tbody>
              </table>`
            : `<div class="empty">No transactions for this report.</div>`
        }
      </section>

      <footer class="footer">
        FXA FITNESS monthly revenue report. Open this file in Chrome/Edge and print to PDF if needed.
      </footer>
    </section>
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
  const [downloading, setDownloading] = useState<ReportType | "revenue-html" | null>(
    null
  );
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

  async function fetchRevenueRows() {
    const { data, error: fetchError } = await supabase
      .from("business_transactions")
      .select("*")
      .gte("transaction_date", monthRange.startDate)
      .lt("transaction_date", monthRange.endDate)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);

    return (data || []) as BusinessTransaction[];
  }

  async function fetchSessionRows() {
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("session_history")
      .select(
        "id, client_id, trainer_id, status, message, trainer_note, remaining_after, created_at"
      )
      .gte("created_at", monthRange.startIso)
      .lt("created_at", monthRange.endIso)
      .order("created_at", { ascending: true });

    if (sessionsError) throw new Error(sessionsError.message);

    const sessions = (sessionsData || []) as SessionHistoryRow[];

    const clientIds = Array.from(
      new Set(
        sessions
          .map((session) => session.client_id)
          .filter((clientId): clientId is string => Boolean(clientId))
      )
    );

    const trainerIds = Array.from(
      new Set(
        sessions
          .map((session) => session.trainer_id)
          .filter((trainerId): trainerId is string => Boolean(trainerId))
      )
    );

    const [{ data: clientsData }, { data: trainersData }] = await Promise.all([
      clientIds.length > 0
        ? supabase.from("clients").select("id, client_code, full_name").in("id", clientIds)
        : Promise.resolve({ data: [] }),
      trainerIds.length > 0
        ? supabase.from("profiles").select("id, full_name, email, role").in("id", trainerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const clientMap = new Map(
      ((clientsData || []) as Pick<ClientRow, "id" | "client_code" | "full_name">[]).map(
        (client) => [client.id, client]
      )
    );

    const trainerMap = new Map(
      ((trainersData || []) as ProfileRow[]).map((trainer) => [
        trainer.id,
        trainer,
      ])
    );

    return sessions.map((session) => {
      const client = session.client_id ? clientMap.get(session.client_id) : null;
      const trainer = session.trainer_id
        ? trainerMap.get(session.trainer_id)
        : null;

      return [
        formatDateTime(session.created_at),
        client?.client_code || "-",
        client?.full_name || "Unknown Client",
        trainer?.full_name || trainer?.email || "Admin / Manual",
        session.status,
        session.remaining_after ?? "",
        session.message || "",
        session.trainer_note || "",
      ];
    });
  }

  async function fetchClientRows() {
    const [
      clientsResult,
      packagesResult,
      purchasesResult,
    ] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, client_code, full_name, email, phone, gender, status, client_source, client_source_other, created_at"
        )
        .order("created_at", { ascending: true }),

      supabase
        .from("session_packages")
        .select(
          "id, client_id, package_name, total_sessions, used_sessions, remaining_sessions, package_value, status, starts_at, expires_at, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, session_count, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at"
        )
        .order("created_at", { ascending: false }),
    ]);

    if (clientsResult.error) throw new Error(clientsResult.error.message);
    if (packagesResult.error) throw new Error(packagesResult.error.message);
    if (purchasesResult.error) throw new Error(purchasesResult.error.message);

    const clients = (clientsResult.data || []) as ClientRow[];
    const packages = (packagesResult.data || []) as SessionPackageRow[];
    const purchases = (purchasesResult.data || []) as ClientPurchaseRow[];

    return clients.map((client) => {
      const clientPackages = packages.filter(
        (packageRow) => packageRow.client_id === client.id
      );

      const clientPurchases = purchases.filter(
        (purchase) => purchase.client_id === client.id
      );

      const latestPackage = getLatestByDate(clientPackages);
      const latestPurchase = getLatestByDate(clientPurchases);

      return [
        client.client_code || "",
        client.full_name,
        client.email || "",
        client.phone || "",
        client.gender || "",
        client.status || "",
        client.client_source_other || getSourceLabel(client.client_source),
        latestPackage?.package_name || latestPurchase?.plan_name || "",
        latestPackage?.total_sessions ?? latestPurchase?.session_count ?? "",
        latestPackage?.used_sessions ?? "",
        latestPackage?.remaining_sessions ?? "",
        latestPackage?.package_value ?? latestPurchase?.price ?? "",
        latestPurchase?.amount_paid ?? "",
        latestPurchase?.balance_due ?? "",
        latestPurchase?.debt_deadline
          ? formatDate(latestPurchase.debt_deadline)
          : "",
        latestPurchase?.purchase_type || "",
        formatDate(client.created_at),
      ];
    });
  }

  async function downloadReport(type: ReportType) {
    setError("");
    setDownloading(type);

    try {
      if (type === "revenue") {
        const rows = await fetchRevenueRows();

        downloadCsv(
          `FXA-Revenue-${monthRange.fileLabel}.csv`,
          [
            "Date",
            "Type",
            "Source",
            "Title",
            "Amount",
            "Notes",
            "Created At",
          ],
          rows.map((row) => [
            row.transaction_date,
            getTransactionTypeLabel(row.transaction_type),
            getSourceLabel(row.source),
            row.title,
            row.amount,
            row.notes || "",
            formatDateTime(row.created_at),
          ])
        );
      }

      if (type === "sessions") {
        const rows = await fetchSessionRows();

        downloadCsv(
          `FXA-Sessions-${monthRange.fileLabel}.csv`,
          [
            "Date / Time",
            "Client Code",
            "Client Name",
            "Trainer",
            "Status",
            "Remaining After",
            "Message",
            "Trainer Note",
          ],
          rows
        );
      }

      if (type === "clients") {
        const rows = await fetchClientRows();

        downloadCsv(
          `FXA-Clients-${monthRange.fileLabel}.csv`,
          [
            "Client Code",
            "Full Name",
            "Email",
            "Phone",
            "Gender",
            "Status",
            "Source",
            "Package",
            "Total Sessions",
            "Used Sessions",
            "Remaining Sessions",
            "Package Value",
            "Amount Paid",
            "Balance Due",
            "Debt Deadline",
            "New / Renew",
            "Created At",
          ],
          rows
        );
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Export failed.");
    }

    setDownloading(null);
  }

  async function downloadRevenueHtmlReport() {
    setError("");
    setDownloading("revenue-html");

    try {
      const rows = await fetchRevenueRows();

      const html = buildRevenueHtmlReport({
        monthLabel: monthRange.label,
        generatedAt: new Date().toLocaleString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        transactions: rows,
      });

      downloadFile(
        `FXA-Revenue-Report-${monthRange.fileLabel}.html`,
        html,
        "text/html;charset=utf-8;"
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Report export failed.");
    }

    setDownloading(null);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="text-sm font-semibold text-yellow-400">
          Checking report access...
        </p>
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                  Monthly Reports
                </h1>

                <p className="mt-3 text-sm font-normal text-gray-400 md:text-base">
                  Export clean monthly reports for revenue, sessions, and client
                  management.
                </p>

                {isManager ? (
                  <p className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                    Manager view: reports are exportable, but editing finance
                    records remains admin-only.
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
                <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                  Year
                </span>
                <input
                  type="number"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="w-full rounded-2xl border border-yellow-500/30 bg-black px-4 py-3 text-sm font-normal text-white outline-none transition focus:border-yellow-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                  Month
                </span>
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
              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                Selected Period
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {monthRange.label}
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
                onClick={downloadRevenueHtmlReport}
                disabled={downloading !== null}
                className="rounded-2xl bg-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "revenue-html"
                  ? "Exporting..."
                  : "Export Revenue Report"}
              </button>

              <button
                type="button"
                onClick={() => downloadReport("revenue")}
                disabled={downloading !== null}
                className="rounded-2xl border border-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "revenue"
                  ? "Exporting..."
                  : "Revenue CSV"}
              </button>

              <button
                type="button"
                onClick={() => downloadReport("sessions")}
                disabled={downloading !== null}
                className="rounded-2xl border border-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "sessions"
                  ? "Exporting..."
                  : "Sessions CSV"}
              </button>

              <button
                type="button"
                onClick={() => downloadReport("clients")}
                disabled={downloading !== null}
                className="rounded-2xl border border-yellow-400 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "clients"
                  ? "Exporting..."
                  : "Clients CSV"}
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="font-semibold text-yellow-300">
                  Revenue Report
                </h3>
                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Professional HTML report with KPI cards, graph, source
                  breakdown, and transaction detail. Open it and print to PDF.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="font-semibold text-yellow-300">
                  Clean CSV Files
                </h3>
                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  CSV files use clean headers and UTF-8 format for Excel or
                  Google Sheets.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="font-semibold text-yellow-300">
                  No API Dependency
                </h3>
                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Reports export directly from Supabase, avoiding broken API
                  routes or missing server files.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}