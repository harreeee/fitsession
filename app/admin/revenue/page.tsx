"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type AdminRole = "admin" | "manager";

type TransactionType = "income" | "expense" | "cash_adjustment";

type BusinessTransaction = {
  id: string;
  transaction_type: TransactionType;
  source: string;
  title: string;
  amount: number;
  notes: string | null;
  transaction_date: string;
  created_at: string;
};

type SourceSummary = {
  source: string;
  label: string;
  incomeTotal: number;
  expenseTotal: number;
  adjustmentTotal: number;
  netTotal: number;
};

const SOURCE_OPTIONS = [
  { value: "package_sale", label: "Package Sale" },
  { value: "membership", label: "Membership" },
  { value: "personal_training", label: "Personal Training" },
  { value: "debt_payment", label: "Debt Payment" },
  { value: "merchandise", label: "Merchandise" },
  { value: "rent", label: "Rent" },
  { value: "payroll", label: "Payroll" },
  { value: "utilities", label: "Utilities" },
  { value: "marketing", label: "Marketing" },
  { value: "equipment", label: "Equipment" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Other" },
];

function getMonthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-CA", {
      month: "long",
      year: "numeric",
    }),
  };
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10);
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

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSourceLabel(value: string) {
  return (
    SOURCE_OPTIONS.find((option) => option.value === value)?.label ||
    value ||
    "Manual"
  );
}

function getTypeLabel(value: TransactionType) {
  if (value === "income") return "Income";
  if (value === "expense") return "Expense";
  return "Cash Adjustment";
}

function getTypeClass(value: TransactionType) {
  if (value === "income") {
    return "border-green-400/30 bg-green-400/10 text-green-300";
  }

  if (value === "expense") {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }

  return "border-blue-400/30 bg-blue-400/10 text-blue-300";
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], {
    type,
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, rows: BusinessTransaction[]) {
  const headers = [
    "Date",
    "Type",
    "Source",
    "Title",
    "Amount",
    "Notes",
    "Created At",
  ];

  const csvRows = rows.map((transaction) => [
    transaction.transaction_date,
    transaction.transaction_type,
    transaction.source,
    transaction.title,
    String(transaction.amount),
    transaction.notes || "",
    transaction.created_at,
  ]);

  const csv = [headers, ...csvRows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  downloadTextFile(filename, csv, "text/csv;charset=utf-8;");
}

function buildSourceChart(sourceTotals: SourceSummary[]) {
  const topSources = sourceTotals.slice(0, 8);
  const maxValue = Math.max(
    ...topSources.map((source) => Math.abs(source.netTotal)),
    1
  );

  if (topSources.length === 0) {
    return `
      <div class="empty-box">
        No source activity for this reporting period.
      </div>
    `;
  }

  return `
    <div class="chart">
      ${topSources
        .map((source) => {
          const percent = Math.max((Math.abs(source.netTotal) / maxValue) * 100, 4);
          const isPositive = source.netTotal >= 0;

          return `
            <div class="chart-row">
              <div class="chart-label">${escapeHtml(source.label)}</div>
              <div class="chart-bar-wrap">
                <div
                  class="chart-bar ${isPositive ? "positive" : "negative"}"
                  style="width: ${percent}%"
                ></div>
              </div>
              <div class="chart-value ${isPositive ? "good" : "bad"}">
                ${escapeHtml(money(source.netTotal))}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildProfessionalReportHtml(args: {
  reportLabel: string;
  generatedAt: string;
  summary: {
    income: number;
    expenses: number;
    adjustments: number;
    net: number;
    cashOnHand: number;
    revenueChangePercent: number;
    averageSale: number;
    expenseRatio: number;
    transactionCount: number;
    sourceTotals: SourceSummary[];
  };
  transactions: BusinessTransaction[];
}) {
  const { reportLabel, generatedAt, summary, transactions } = args;

  const sourceRows = summary.sourceTotals
    .map(
      (source) => `
        <tr>
          <td>${escapeHtml(source.label)}</td>
          <td class="right good">${escapeHtml(money(source.incomeTotal))}</td>
          <td class="right bad">${escapeHtml(money(source.expenseTotal))}</td>
          <td class="right">${escapeHtml(money(source.adjustmentTotal))}</td>
          <td class="right ${source.netTotal >= 0 ? "good" : "bad"}">
            ${escapeHtml(money(source.netTotal))}
          </td>
        </tr>
      `
    )
    .join("");

  const transactionRows = transactions
    .map((transaction) => {
      const isExpense = transaction.transaction_type === "expense";
      const isAdjustment = transaction.transaction_type === "cash_adjustment";

      return `
        <tr>
          <td>${escapeHtml(formatDate(transaction.transaction_date))}</td>
          <td>
            <span class="pill ${transaction.transaction_type}">
              ${escapeHtml(getTypeLabel(transaction.transaction_type))}
            </span>
          </td>
          <td>${escapeHtml(getSourceLabel(transaction.source))}</td>
          <td>
            <strong>${escapeHtml(transaction.title)}</strong>
            ${
              transaction.notes
                ? `<div class="note">${escapeHtml(transaction.notes)}</div>`
                : ""
            }
          </td>
          <td class="right ${isExpense ? "bad" : isAdjustment ? "blue" : "good"}">
            ${isExpense ? "-" : "+"}${escapeHtml(money(transaction.amount))}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FXA Fitness Revenue Report - ${escapeHtml(reportLabel)}</title>
  <style>
    * {
      box-sizing: border-box;
    }

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
      padding: 32px;
    }

    .report {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
    }

    .header {
      background: linear-gradient(135deg, #050505, #151515);
      color: white;
      padding: 32px;
      border-bottom: 6px solid #facc15;
    }

    .brand {
      color: #facc15;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.28em;
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
      padding: 28px 32px;
      border-bottom: 1px solid #e5e7eb;
    }

    .section-title {
      margin: 0 0 14px;
      font-size: 20px;
      font-weight: 800;
      color: #111827;
    }

    .kpis {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
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
      letter-spacing: 0.08em;
      color: #6b7280;
      text-transform: uppercase;
    }

    .kpi-value {
      margin-top: 8px;
      font-size: 24px;
      font-weight: 900;
      color: #111827;
    }

    .good {
      color: #047857;
    }

    .bad {
      color: #dc2626;
    }

    .blue {
      color: #2563eb;
    }

    .small-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-top: 14px;
    }

    .chart {
      display: grid;
      gap: 12px;
      margin-top: 8px;
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

    .chart-bar-wrap {
      height: 18px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
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
      font-weight: 800;
      font-size: 13px;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 22px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th {
      background: #111827;
      color: #facc15;
      padding: 11px;
      text-align: left;
      font-size: 11px;
      letter-spacing: 0.08em;
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

    .pill {
      display: inline-block;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .pill.income {
      background: #dcfce7;
      color: #047857;
    }

    .pill.expense {
      background: #fee2e2;
      color: #dc2626;
    }

    .pill.cash_adjustment {
      background: #dbeafe;
      color: #2563eb;
    }

    .note {
      margin-top: 4px;
      color: #6b7280;
      font-size: 12px;
    }

    .empty-box {
      padding: 18px;
      border: 1px dashed #d1d5db;
      border-radius: 18px;
      color: #6b7280;
      background: #fafafa;
      text-align: center;
    }

    .footer {
      padding: 18px 32px;
      color: #6b7280;
      font-size: 12px;
      background: #fafafa;
    }

    @media print {
      body {
        background: white;
      }

      .page {
        padding: 0;
      }

      .report {
        border-radius: 0;
        box-shadow: none;
      }
    }

    @media (max-width: 900px) {
      .kpis,
      .small-grid,
      .two-col {
        grid-template-columns: 1fr;
      }

      .chart-row {
        grid-template-columns: 1fr;
      }

      .chart-value {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="report">
      <header class="header">
        <div class="brand">FXA FITNESS</div>
        <h1>Revenue Report</h1>
        <div class="subtitle">
          ${escapeHtml(reportLabel)} · Generated ${escapeHtml(generatedAt)}
        </div>
      </header>

      <section class="section">
        <h2 class="section-title">Financial Snapshot</h2>

        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Income</div>
            <div class="kpi-value good">${escapeHtml(money(summary.income))}</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Expenses</div>
            <div class="kpi-value bad">${escapeHtml(money(summary.expenses))}</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Net</div>
            <div class="kpi-value ${summary.net >= 0 ? "good" : "bad"}">
              ${escapeHtml(money(summary.net))}
            </div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Cash on hand</div>
            <div class="kpi-value">${escapeHtml(money(summary.cashOnHand))}</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Revenue change</div>
            <div class="kpi-value ${
              summary.revenueChangePercent >= 0 ? "good" : "bad"
            }">
              ${escapeHtml(summary.revenueChangePercent.toFixed(1))}%
            </div>
          </div>
        </div>

        <div class="small-grid">
          <div class="kpi">
            <div class="kpi-label">Average sale</div>
            <div class="kpi-value">${escapeHtml(money(summary.averageSale))}</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Expense ratio</div>
            <div class="kpi-value bad">${escapeHtml(summary.expenseRatio.toFixed(1))}%</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Transactions</div>
            <div class="kpi-value">${escapeHtml(summary.transactionCount)}</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Adjustments</div>
            <div class="kpi-value blue">${escapeHtml(money(summary.adjustments))}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Source Performance Graph</h2>
        ${buildSourceChart(summary.sourceTotals)}
      </section>

      <section class="section">
        <h2 class="section-title">Source Breakdown</h2>

        ${
          sourceRows
            ? `
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th class="right">Income</th>
                    <th class="right">Expense</th>
                    <th class="right">Adjustment</th>
                    <th class="right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  ${sourceRows}
                </tbody>
              </table>
            `
            : `<div class="empty-box">No source breakdown available.</div>`
        }
      </section>

      <section class="section">
        <h2 class="section-title">Transactions</h2>

        ${
          transactionRows
            ? `
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Details</th>
                    <th class="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${transactionRows}
                </tbody>
              </table>
            `
            : `<div class="empty-box">No transactions in this report.</div>`
        }
      </section>

      <footer class="footer">
        FXA FITNESS finance report. Exported from the Revenue dashboard.
      </footer>
    </section>
  </main>
</body>
</html>
  `.trim();
}

export default function AdminRevenuePage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking revenue access..."
  );
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);

  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [monthOffset, setMonthOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [transactionType, setTransactionType] =
    useState<TransactionType>("income");
  const [source, setSource] = useState("package_sale");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(getTodayInputDate());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = currentRole === "admin";
  const monthRange = getMonthRange(monthOffset);

  async function fetchTransactions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("business_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setTransactions((data || []) as BusinessTransaction[]);
    setLoading(false);
  }

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role === "admin" || role === "manager") {
        setCurrentRole(role);
        setCheckingRole(false);
        await fetchTransactions();
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

  const availableSources = useMemo(() => {
    return Array.from(
      new Set(transactions.map((transaction) => transaction.source || "manual"))
    ).sort();
  }, [transactions]);

  const monthTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      return (
        transaction.transaction_date >= monthRange.start &&
        transaction.transaction_date < monthRange.end
      );
    });
  }, [transactions, monthRange.start, monthRange.end]);

  const filteredTransactions = useMemo(() => {
    const cleanSearch = searchText.trim().toLowerCase();

    return monthTransactions.filter((transaction) => {
      if (typeFilter !== "all" && transaction.transaction_type !== typeFilter) {
        return false;
      }

      if (sourceFilter !== "all" && transaction.source !== sourceFilter) {
        return false;
      }

      if (cleanSearch) {
        const searchableText = [
          transaction.title,
          transaction.source,
          transaction.notes || "",
          transaction.transaction_type,
        ]
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(cleanSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [monthTransactions, typeFilter, sourceFilter, searchText]);

  const summary = useMemo(() => {
    const lastMonth = getMonthRange(monthOffset - 1);

    const lastMonthTransactions = transactions.filter((transaction) => {
      return (
        transaction.transaction_date >= lastMonth.start &&
        transaction.transaction_date < lastMonth.end
      );
    });

    const income = monthTransactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const expenses = monthTransactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const adjustments = monthTransactions
      .filter(
        (transaction) => transaction.transaction_type === "cash_adjustment"
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const lastIncome = lastMonthTransactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const allIncome = transactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const allExpenses = transactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const allAdjustments = transactions
      .filter(
        (transaction) => transaction.transaction_type === "cash_adjustment"
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const cashOnHand = allIncome + allAdjustments - allExpenses;
    const net = income + adjustments - expenses;

    let revenueChangePercent = 0;

    if (lastIncome > 0) {
      revenueChangePercent = ((income - lastIncome) / lastIncome) * 100;
    } else if (income > 0) {
      revenueChangePercent = 100;
    }

    const incomeTransactions = monthTransactions.filter(
      (transaction) => transaction.transaction_type === "income"
    );

    const averageSale =
      incomeTransactions.length > 0 ? income / incomeTransactions.length : 0;

    const expenseRatio = income > 0 ? (expenses / income) * 100 : 0;

    const sourceTotals = SOURCE_OPTIONS.map((option) => {
      const sourceRows = monthTransactions.filter(
        (transaction) => transaction.source === option.value
      );

      const incomeTotal = sourceRows
        .filter((transaction) => transaction.transaction_type === "income")
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      const expenseTotal = sourceRows
        .filter((transaction) => transaction.transaction_type === "expense")
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      const adjustmentTotal = sourceRows
        .filter(
          (transaction) => transaction.transaction_type === "cash_adjustment"
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      return {
        source: option.value,
        label: option.label,
        incomeTotal,
        expenseTotal,
        adjustmentTotal,
        netTotal: incomeTotal + adjustmentTotal - expenseTotal,
      };
    })
      .filter(
        (item) =>
          item.incomeTotal !== 0 ||
          item.expenseTotal !== 0 ||
          item.adjustmentTotal !== 0
      )
      .sort((a, b) => Math.abs(b.netTotal) - Math.abs(a.netTotal));

    return {
      income,
      expenses,
      adjustments,
      net,
      cashOnHand,
      revenueChangePercent,
      averageSale,
      expenseRatio,
      transactionCount: monthTransactions.length,
      sourceTotals,
    };
  }, [transactions, monthTransactions, monthOffset]);

  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isAdmin) {
      setMessage("Only admins can add revenue or expense transactions.");
      return;
    }

    const parsedAmount = Number(amount);

    if (!title.trim()) {
      setMessage("Title is required.");
      return;
    }

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setMessage("Amount must be greater than 0.");
      return;
    }

    if (!transactionDate) {
      setMessage("Transaction date is required.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("business_transactions").insert({
      transaction_type: transactionType,
      source,
      title: title.trim(),
      amount: parsedAmount,
      notes: notes.trim() || null,
      created_by: userData.user?.id || null,
      transaction_date: transactionDate,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setTitle("");
    setAmount("");
    setNotes("");
    setTransactionType("income");
    setSource("package_sale");
    setTransactionDate(getTodayInputDate());
    setMessage("Transaction added.");
    setSaving(false);
    await fetchTransactions();
  }

  async function deleteTransaction(transactionId: string) {
    if (!isAdmin) {
      setMessage("Only admins can delete transactions.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this transaction? This cannot be undone."
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("business_transactions")
      .delete()
      .eq("id", transactionId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Transaction deleted.");
    await fetchTransactions();
  }

  function exportProfessionalReport() {
    const html = buildProfessionalReportHtml({
      reportLabel: monthRange.label,
      generatedAt: new Date().toLocaleString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      summary,
      transactions: filteredTransactions,
    });

    downloadTextFile(
      `fxa-revenue-report-${monthRange.label
        .toLowerCase()
        .replace(/\s+/g, "-")}.html`,
      html,
      "text/html;charset=utf-8;"
    );
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="text-sm font-semibold text-yellow-400">
          {checkingMessage}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-black p-3 text-white md:p-5">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <header className="mb-4 rounded-3xl border border-yellow-500/25 bg-black/60 p-4 shadow-2xl md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-5xl">
                  Revenue
                </h1>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Income, expenses, net profit, cash flow, and source performance.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/admin"
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Dashboard
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `fxa-revenue-data-${monthRange.label
                        .toLowerCase()
                        .replace(/\s+/g, "-")}.csv`,
                      filteredTransactions
                    )
                  }
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Export CSV
                </button>

                <button
                  type="button"
                  onClick={exportProfessionalReport}
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Export Report
                </button>
              </div>
            </div>

            {currentRole === "manager" ? (
              <p className="mt-3 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                Manager view: finance data is visible, but adding or deleting
                transactions is admin-only.
              </p>
            ) : null}
          </header>

          {message ? (
            <div className="mb-4 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm font-normal text-yellow-200">
              {message}
            </div>
          ) : null}

          <section className="mb-4 rounded-3xl border border-yellow-500/25 bg-white/[0.06] p-4 shadow-2xl">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Reporting Period
                </p>

                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {monthRange.label}
                </h2>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 xl:w-auto">
                <button
                  type="button"
                  onClick={() => setMonthOffset((value) => value - 1)}
                  className="rounded-xl border border-yellow-400 px-3 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() => setMonthOffset(0)}
                  className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Current
                </button>

                <button
                  type="button"
                  onClick={() => setMonthOffset((value) => value + 1)}
                  className="rounded-xl border border-yellow-400 px-3 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          {loading ? (
            <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 text-center shadow-2xl">
              <p className="text-sm font-semibold text-yellow-400">
                Loading revenue...
              </p>
            </section>
          ) : (
            <>
              <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-3xl border border-green-500/25 bg-green-500/10 p-4 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Income
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-green-300">
                    {money(summary.income)}
                  </p>
                </div>

                <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-4 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Expenses
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-red-300">
                    {money(summary.expenses)}
                  </p>
                </div>

                <div className="rounded-3xl border border-yellow-500/25 bg-yellow-400/10 p-4 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Net
                  </p>
                  <p
                    className={`mt-2 text-3xl font-semibold ${
                      summary.net >= 0 ? "text-yellow-300" : "text-red-300"
                    }`}
                  >
                    {money(summary.net)}
                  </p>
                </div>

                <div className="rounded-3xl border border-blue-500/25 bg-blue-500/10 p-4 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Cash
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-blue-300">
                    {money(summary.cashOnHand)}
                  </p>
                </div>

                <div className="rounded-3xl border border-orange-500/25 bg-orange-500/10 p-4 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Change
                  </p>
                  <p
                    className={`mt-2 text-3xl font-semibold ${
                      summary.revenueChangePercent >= 0
                        ? "text-green-300"
                        : "text-red-300"
                    }`}
                  >
                    {summary.revenueChangePercent.toFixed(1)}%
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl">
                  <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                    Avg Sale
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-yellow-300">
                    {money(summary.averageSale)}
                  </p>
                </div>
              </section>

              <section className="mb-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-3xl border border-yellow-500/25 bg-white/[0.06] p-4 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                        Source Summary
                      </p>

                      <h2 className="mt-1 text-xl font-semibold text-white">
                        Money by Category
                      </h2>
                    </div>

                    <div className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-right">
                      <p className="text-xs text-gray-400">Expense Ratio</p>
                      <p className="text-lg font-semibold text-red-300">
                        {summary.expenseRatio.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {summary.sourceTotals.length === 0 ? (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-gray-400">
                      No source activity this month.
                    </p>
                  ) : (
                    <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                      {summary.sourceTotals.slice(0, 8).map((item) => (
                        <div
                          key={item.source}
                          className="rounded-2xl border border-white/10 bg-black/45 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">
                                {item.label}
                              </p>
                              <p className="text-xs text-gray-400">
                                Income {money(item.incomeTotal)} · Expense{" "}
                                {money(item.expenseTotal)}
                              </p>
                            </div>

                            <p
                              className={`text-lg font-semibold ${
                                item.netTotal >= 0
                                  ? "text-green-300"
                                  : "text-red-300"
                              }`}
                            >
                              {money(item.netTotal)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-yellow-500/25 bg-white/[0.06] p-4 shadow-2xl">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                        Add Transaction
                      </p>

                      <h2 className="mt-1 text-xl font-semibold text-white">
                        Quick Finance Entry
                      </h2>
                    </div>

                    {!isAdmin ? (
                      <span className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-100">
                        Read-only
                      </span>
                    ) : null}
                  </div>

                  <form
                    onSubmit={addTransaction}
                    className="mt-4 grid gap-3 md:grid-cols-6"
                  >
                    <select
                      value={transactionType}
                      onChange={(event) =>
                        setTransactionType(event.target.value as TransactionType)
                      }
                      disabled={!isAdmin}
                      className="rounded-2xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-60 md:col-span-2"
                    >
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="cash_adjustment">Cash Adjustment</option>
                    </select>

                    <select
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                      disabled={!isAdmin}
                      className="rounded-2xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-60 md:col-span-2"
                    >
                      {SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="Amount"
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!isAdmin}
                      className="rounded-2xl border border-yellow-500/30 bg-black/50 px-3 py-3 text-sm text-white outline-none disabled:opacity-60 md:col-span-2"
                    />

                    <input
                      value={transactionDate}
                      onChange={(event) => setTransactionDate(event.target.value)}
                      type="date"
                      disabled={!isAdmin}
                      className="rounded-2xl border border-yellow-500/30 bg-black/50 px-3 py-3 text-sm text-white outline-none disabled:opacity-60 md:col-span-2"
                    />

                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Title"
                      disabled={!isAdmin}
                      className="rounded-2xl border border-yellow-500/30 bg-black/50 px-3 py-3 text-sm text-white outline-none disabled:opacity-60 md:col-span-4"
                    />

                    <input
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Notes"
                      disabled={!isAdmin}
                      className="rounded-2xl border border-yellow-500/30 bg-black/50 px-3 py-3 text-sm text-white outline-none disabled:opacity-60 md:col-span-4"
                    />

                    {isAdmin ? (
                      <button
                        disabled={saving}
                        className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60 md:col-span-2"
                      >
                        {saving ? "Adding..." : "Add"}
                      </button>
                    ) : (
                      <p className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100 md:col-span-2">
                        Admin-only
                      </p>
                    )}
                  </form>
                </section>
              </section>

              <section className="rounded-3xl border border-yellow-500/25 bg-white/[0.06] p-4 shadow-2xl">
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                      Transactions
                    </p>

                    <h2 className="mt-1 text-xl font-semibold text-white">
                      Current View
                    </h2>
                  </div>

                  <div className="grid gap-2 md:grid-cols-4 xl:w-[720px]">
                    <select
                      value={typeFilter}
                      onChange={(event) =>
                        setTypeFilter(
                          event.target.value as "all" | TransactionType
                        )
                      }
                      className="rounded-xl border border-yellow-500/30 bg-white px-3 py-2 text-sm text-black outline-none"
                    >
                      <option value="all">All Types</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="cash_adjustment">Cash Adjustment</option>
                    </select>

                    <select
                      value={sourceFilter}
                      onChange={(event) => setSourceFilter(event.target.value)}
                      className="rounded-xl border border-yellow-500/30 bg-white px-3 py-2 text-sm text-black outline-none"
                    >
                      <option value="all">All Sources</option>
                      {availableSources.map((sourceValue) => (
                        <option key={sourceValue} value={sourceValue}>
                          {getSourceLabel(sourceValue)}
                        </option>
                      ))}
                    </select>

                    <input
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Search..."
                      className="rounded-xl border border-yellow-500/30 bg-black/50 px-3 py-2 text-sm text-white outline-none md:col-span-2"
                    />
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                    No transactions match this view.
                  </p>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/10">
                    <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-yellow-400 text-black">
                        <tr>
                          <th className="p-3 font-semibold uppercase">Date</th>
                          <th className="p-3 font-semibold uppercase">Type</th>
                          <th className="p-3 font-semibold uppercase">
                            Source
                          </th>
                          <th className="p-3 font-semibold uppercase">Title</th>
                          <th className="p-3 text-right font-semibold uppercase">
                            Amount
                          </th>
                          <th className="p-3 text-right font-semibold uppercase">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredTransactions.map((transaction, index) => (
                          <tr
                            key={transaction.id}
                            className={`border-b border-white/10 ${
                              index % 2 === 0 ? "bg-black/45" : "bg-white/[0.04]"
                            }`}
                          >
                            <td className="p-3 text-gray-300">
                              {formatDate(transaction.transaction_date)}
                            </td>

                            <td className="p-3">
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getTypeClass(
                                  transaction.transaction_type
                                )}`}
                              >
                                {getTypeLabel(transaction.transaction_type)}
                              </span>
                            </td>

                            <td className="p-3 text-gray-300">
                              {getSourceLabel(transaction.source)}
                            </td>

                            <td className="p-3">
                              <p className="font-normal text-white">
                                {transaction.title}
                              </p>
                              {transaction.notes ? (
                                <p className="mt-1 text-xs text-gray-500">
                                  {transaction.notes}
                                </p>
                              ) : null}
                            </td>

                            <td
                              className={`p-3 text-right font-semibold ${
                                transaction.transaction_type === "expense"
                                  ? "text-red-300"
                                  : transaction.transaction_type ===
                                      "cash_adjustment"
                                    ? "text-blue-300"
                                    : "text-green-300"
                              }`}
                            >
                              {transaction.transaction_type === "expense"
                                ? "-"
                                : "+"}
                              {money(transaction.amount)}
                            </td>

                            <td className="p-3 text-right">
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteTransaction(transaction.id)
                                  }
                                  className="rounded-xl border border-red-400 px-3 py-2 text-xs font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black"
                                >
                                  Delete
                                </button>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  View
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}