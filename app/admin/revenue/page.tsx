"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type AdminRole = "admin" | "manager";
type TransactionType = "income" | "expense" | "cash_adjustment";
type TabKey = "overview" | "journal" | "debt" | "ledger" | "profit_loss";
type DebtView = "receivable" | "payable";
type JournalEntryMode = "regular" | "pay_payable";

type ReportGroup =
  | "sales_revenue"
  | "revenue_deduction"
  | "cost_of_sales"
  | "financial_income"
  | "financial_expense"
  | "selling_expense"
  | "admin_expense"
  | "other_income"
  | "other_expense"
  | "income_tax_current"
  | "income_tax_deferred"
  | "cash_only";

type ExpenseGroup =
  | "cost_of_sales"
  | "financial_expense"
  | "selling_expense"
  | "admin_expense"
  | "other_expense"
  | "income_tax_current"
  | "income_tax_deferred";

type PayableType =
  | "salary"
  | "commission"
  | "rent"
  | "utilities"
  | "supplier"
  | "tax"
  | "loan"
  | "other";

type BusinessTransaction = {
  id: string;
  transaction_type: TransactionType;
  source: string;
  title: string;
  amount: number | string;
  notes: string | null;
  created_by?: string | null;
  transaction_date: string;
  accounting_month: string | null;
  report_group: ReportGroup | null;
  counterparty: string | null;
  payable_id: string | null;
  created_at: string;
};

type BusinessPayable = {
  id: string;
  accounting_month: string;
  payable_type: PayableType;
  counterparty: string;
  title: string;
  total_amount: number | string;
  paid_amount: number | string;
  due_date: string | null;
  expense_group: ExpenseGroup;
  notes: string | null;
  status: "unpaid" | "partial" | "paid" | "cancelled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClientRelation = {
  id: string;
  full_name: string | null;
  client_code: string | null;
};

type ClientDebt = {
  id: string;
  client_id: string;
  plan_name: string | null;
  price: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  debt_deadline: string | null;
  debt_month: string | null;
  purchase_type: string | null;
  status: string | null;
  created_at: string;
  clients: ClientRelation | ClientRelation[] | null;
};

type ReceivableEditDraft = {
  planName: string;
  balanceDue: string;
  debtDeadline: string;
  debtMonth: string;
};

type PayableEditDraft = {
  accountingMonth: string;
  payableType: PayableType;
  expenseGroup: ExpenseGroup;
  counterparty: string;
  title: string;
  totalAmount: string;
  dueDate: string;
  notes: string;
};

type TransactionEditDraft = {
  transactionType: TransactionType;
  source: string;
  title: string;
  amount: string;
  transactionDate: string;
  accountingMonth: string;
  reportGroup: ReportGroup;
  counterparty: string;
  notes: string;
};

type ProfitLoss = {
  salesRevenue: number;
  revenueDeductions: number;
  netRevenue: number;
  costOfSales: number;
  grossProfit: number;
  financialIncome: number;
  financialExpense: number;
  sellingExpense: number;
  adminExpense: number;
  operatingProfit: number;
  otherIncome: number;
  otherExpense: number;
  otherProfit: number;
  profitBeforeTax: number;
  incomeTaxCurrent: number;
  incomeTaxDeferred: number;
  recordedIncomeTaxCurrent: number;
  taxRate: number | null;
  netProfit: number;
  unclassifiedCount: number;
};

type ProfitLossRow = {
  item: string;
  code: string;
  note: string;
  current: number;
  previous: number;
  bold?: boolean;
};

const REPORT_GROUP_OPTIONS: Array<{
  value: ReportGroup;
  label: string;
  transactionTypes: TransactionType[];
}> = [
  {
    value: "sales_revenue",
    label: "Doanh thu bán hàng / dịch vụ",
    transactionTypes: ["income"],
  },
  {
    value: "revenue_deduction",
    label: "Khoản giảm trừ doanh thu",
    transactionTypes: ["expense"],
  },
  {
    value: "cost_of_sales",
    label: "Giá vốn / chi phí trực tiếp",
    transactionTypes: ["expense"],
  },
  {
    value: "financial_income",
    label: "Doanh thu tài chính",
    transactionTypes: ["income"],
  },
  {
    value: "financial_expense",
    label: "Chi phí tài chính",
    transactionTypes: ["expense"],
  },
  {
    value: "selling_expense",
    label: "Chi phí bán hàng / marketing",
    transactionTypes: ["expense"],
  },
  {
    value: "admin_expense",
    label: "Chi phí quản lý doanh nghiệp",
    transactionTypes: ["expense"],
  },
  {
    value: "other_income",
    label: "Thu nhập khác",
    transactionTypes: ["income"],
  },
  {
    value: "other_expense",
    label: "Chi phí khác / chưa phân loại",
    transactionTypes: ["expense"],
  },
  {
    value: "income_tax_current",
    label: "Thuế TNDN hiện hành",
    transactionTypes: ["expense"],
  },
  {
    value: "income_tax_deferred",
    label: "Thuế TNDN hoãn lại",
    transactionTypes: ["expense"],
  },
  {
    value: "cash_only",
    label: "Chỉ ảnh hưởng tiền mặt, không vào lãi lỗ",
    transactionTypes: ["cash_adjustment", "expense", "income"],
  },
];

const EXPENSE_GROUP_OPTIONS: Array<{
  value: ExpenseGroup;
  label: string;
}> = REPORT_GROUP_OPTIONS.filter(
  (option): option is { value: ExpenseGroup; label: string; transactionTypes: TransactionType[] } =>
    [
      "cost_of_sales",
      "financial_expense",
      "selling_expense",
      "admin_expense",
      "other_expense",
      "income_tax_current",
      "income_tax_deferred",
    ].includes(option.value),
).map((option) => ({ value: option.value, label: option.label }));

const SOURCE_OPTIONS = [
  { value: "package_sale", label: "Bán gói tập" },
  { value: "membership", label: "Membership" },
  { value: "personal_training", label: "Personal Training" },
  { value: "debt_payment", label: "Thu công nợ khách hàng" },
  { value: "payable_payment", label: "Thanh toán công nợ phải trả" },
  { value: "merchandise", label: "Hàng hóa" },
  { value: "rent", label: "Tiền thuê" },
  { value: "payroll", label: "Lương" },
  { value: "utilities", label: "Điện nước / tiện ích" },
  { value: "marketing", label: "Marketing" },
  { value: "equipment", label: "Thiết bị" },
  { value: "manual", label: "Nhập thủ công" },
  { value: "other", label: "Khác" },
];

const PAYABLE_TYPE_OPTIONS: Array<{ value: PayableType; label: string }> = [
  { value: "salary", label: "Lương" },
  { value: "commission", label: "Hoa hồng" },
  { value: "rent", label: "Tiền thuê" },
  { value: "utilities", label: "Điện nước / tiện ích" },
  { value: "supplier", label: "Nhà cung cấp" },
  { value: "tax", label: "Thuế" },
  { value: "loan", label: "Khoản vay" },
  { value: "other", label: "Khác" },
];

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  {
    key: "overview",
    label: "Tổng quan",
    description: "Tình hình tiền mặt, công nợ và lợi nhuận",
  },
  {
    key: "journal",
    label: "Nhật ký thu chi",
    description: "Theo dõi tiền đã thu, đã chi và điều chỉnh",
  },
  {
    key: "debt",
    label: "Theo dõi công nợ",
    description: "Khách hàng nợ mình và các khoản mình phải chi",
  },
  {
    key: "ledger",
    label: "Tổng hợp kế toán",
    description: "Tổng hợp doanh thu và chi phí theo nhóm",
  },
  {
    key: "profit_loss",
    label: "Báo cáo lãi / lỗ",
    description: "Xem doanh thu, chi phí và lợi nhuận",
  },
];

const DEFAULT_MONTH = getCurrentMonthKey();

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonthKey(value: string | null | undefined) {
  if (!value) return DEFAULT_MONTH;
  return value.slice(0, 7);
}

function monthStart(monthKey: string) {
  return `${monthKey}-01`;
}

function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const value = new Date(year, month - 2, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });
}

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalTaxRate(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

function money(value: unknown) {
  return toNumber(value).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getClientRelation(value: ClientDebt["clients"]) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getSourceLabel(source: string) {
  return SOURCE_OPTIONS.find((option) => option.value === source)?.label || source || "Khác";
}

function getReportGroupLabel(group: ReportGroup | null | undefined) {
  if (!group) return "Chưa phân loại";
  return REPORT_GROUP_OPTIONS.find((option) => option.value === group)?.label || group;
}

function getPayableTypeLabel(value: PayableType) {
  return PAYABLE_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function getPayableStatusLabel(status: BusinessPayable["status"]) {
  if (status === "paid") return "Đã trả đủ";
  if (status === "partial") return "Đã trả một phần";
  if (status === "cancelled") return "Đã hủy";
  return "Chưa trả";
}

function getTransactionAccountingMonth(transaction: BusinessTransaction) {
  return normalizeMonthKey(transaction.accounting_month || transaction.transaction_date);
}

function getClientDebtMonth(debt: ClientDebt) {
  return normalizeMonthKey(debt.debt_month || debt.created_at);
}

function getTransactionSign(transaction: BusinessTransaction) {
  if (transaction.transaction_type === "expense") return -1;
  if (transaction.transaction_type === "cash_adjustment") {
    return toNumber(transaction.amount) < 0 ? -1 : 1;
  }
  return 1;
}

function fallbackReportGroup(transaction: BusinessTransaction): ReportGroup {
  if (transaction.report_group) return transaction.report_group;

  const source = String(transaction.source || "").toLowerCase();

  if (transaction.transaction_type === "cash_adjustment") return "cash_only";

  if (transaction.transaction_type === "income") {
    if (["package_sale", "membership", "personal_training", "debt_payment"].includes(source)) {
      return "sales_revenue";
    }
    if (source.includes("interest") || source.includes("financial")) {
      return "financial_income";
    }
    return "other_income";
  }

  if (source === "payable_payment") return "cash_only";
  if (source === "marketing") return "selling_expense";
  if (["rent", "payroll", "utilities", "equipment"].includes(source)) {
    return "admin_expense";
  }
  return "other_expense";
}

function buildProfitLoss(
  monthKey: string,
  transactions: BusinessTransaction[],
  payables: BusinessPayable[],
  taxRate: number | null,
): ProfitLoss {
  const currentTransactions = transactions.filter(
    (transaction) => getTransactionAccountingMonth(transaction) === monthKey,
  );

  const currentPayables = payables.filter(
    (payable) =>
      normalizeMonthKey(payable.accounting_month) === monthKey &&
      payable.status !== "cancelled",
  );

  const sums: Record<ReportGroup, number> = {
    sales_revenue: 0,
    revenue_deduction: 0,
    cost_of_sales: 0,
    financial_income: 0,
    financial_expense: 0,
    selling_expense: 0,
    admin_expense: 0,
    other_income: 0,
    other_expense: 0,
    income_tax_current: 0,
    income_tax_deferred: 0,
    cash_only: 0,
  };

  let unclassifiedCount = 0;

  for (const transaction of currentTransactions) {
    if (!transaction.report_group) unclassifiedCount += 1;

    const group = fallbackReportGroup(transaction);

    // Settlement of a payable affects cash only. The payable amount itself is
    // already recognized below as an accrued expense in its accounting month.
    if (transaction.payable_id || group === "cash_only") continue;

    sums[group] += Math.abs(toNumber(transaction.amount));
  }

  for (const payable of currentPayables) {
    sums[payable.expense_group] += toNumber(payable.total_amount);
  }

  const netRevenue = sums.sales_revenue - sums.revenue_deduction;
  const grossProfit = netRevenue - sums.cost_of_sales;
  const operatingProfit =
    grossProfit +
    sums.financial_income -
    sums.financial_expense -
    sums.selling_expense -
    sums.admin_expense;
  const otherProfit = sums.other_income - sums.other_expense;
  const profitBeforeTax = operatingProfit + otherProfit;
  const recordedIncomeTaxCurrent = sums.income_tax_current;
  const incomeTaxCurrent =
    taxRate === null
      ? recordedIncomeTaxCurrent
      : Math.max(profitBeforeTax, 0) * (taxRate / 100);
  const netProfit = profitBeforeTax - incomeTaxCurrent - sums.income_tax_deferred;

  return {
    salesRevenue: sums.sales_revenue,
    revenueDeductions: sums.revenue_deduction,
    netRevenue,
    costOfSales: sums.cost_of_sales,
    grossProfit,
    financialIncome: sums.financial_income,
    financialExpense: sums.financial_expense,
    sellingExpense: sums.selling_expense,
    adminExpense: sums.admin_expense,
    operatingProfit,
    otherIncome: sums.other_income,
    otherExpense: sums.other_expense,
    otherProfit,
    profitBeforeTax,
    incomeTaxCurrent,
    incomeTaxDeferred: sums.income_tax_deferred,
    recordedIncomeTaxCurrent,
    taxRate,
    netProfit,
    unclassifiedCount,
  };
}

function buildProfitLossRows(current: ProfitLoss, previous: ProfitLoss): ProfitLossRow[] {
  return [
    {
      item: "1. Doanh thu bán hàng và cung cấp dịch vụ",
      code: "01",
      note: "VII.1",
      current: current.salesRevenue,
      previous: previous.salesRevenue,
    },
    {
      item: "2. Các khoản giảm trừ doanh thu",
      code: "02",
      note: "VII.2",
      current: current.revenueDeductions,
      previous: previous.revenueDeductions,
    },
    {
      item: "3. Doanh thu thuần về bán hàng và cung cấp dịch vụ (10 = 01 - 02)",
      code: "10",
      note: "",
      current: current.netRevenue,
      previous: previous.netRevenue,
      bold: true,
    },
    {
      item: "4. Giá vốn hàng bán / chi phí trực tiếp",
      code: "11",
      note: "VII.3",
      current: current.costOfSales,
      previous: previous.costOfSales,
    },
    {
      item: "5. Lợi nhuận gộp về bán hàng và cung cấp dịch vụ (20 = 10 - 11)",
      code: "20",
      note: "",
      current: current.grossProfit,
      previous: previous.grossProfit,
      bold: true,
    },
    {
      item: "6. Doanh thu hoạt động tài chính",
      code: "21",
      note: "VII.4",
      current: current.financialIncome,
      previous: previous.financialIncome,
    },
    {
      item: "7. Chi phí tài chính",
      code: "22",
      note: "VII.5",
      current: current.financialExpense,
      previous: previous.financialExpense,
    },
    {
      item: "- Trong đó: Chi phí lãi vay",
      code: "23",
      note: "",
      current: 0,
      previous: 0,
    },
    {
      item: "8. Chi phí bán hàng",
      code: "25",
      note: "VII.8",
      current: current.sellingExpense,
      previous: previous.sellingExpense,
    },
    {
      item: "9. Chi phí quản lý doanh nghiệp",
      code: "26",
      note: "VII.8",
      current: current.adminExpense,
      previous: previous.adminExpense,
    },
    {
      item: "10. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20 + 21 - 22 - 25 - 26)",
      code: "30",
      note: "",
      current: current.operatingProfit,
      previous: previous.operatingProfit,
      bold: true,
    },
    {
      item: "11. Thu nhập khác",
      code: "31",
      note: "VII.6",
      current: current.otherIncome,
      previous: previous.otherIncome,
    },
    {
      item: "12. Chi phí khác / chưa phân loại",
      code: "32",
      note: "VII.7",
      current: current.otherExpense,
      previous: previous.otherExpense,
    },
    {
      item: "13. Lợi nhuận khác (40 = 31 - 32)",
      code: "40",
      note: "",
      current: current.otherProfit,
      previous: previous.otherProfit,
      bold: true,
    },
    {
      item: "14. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)",
      code: "50",
      note: "",
      current: current.profitBeforeTax,
      previous: previous.profitBeforeTax,
      bold: true,
    },
    {
      item:
        current.taxRate === null
          ? "15. Chi phí thuế TNDN hiện hành"
          : `15. Thuế TNDN ước tính (${current.taxRate}%)`,
      code: "51",
      note: "VII.10",
      current: current.incomeTaxCurrent,
      previous: previous.incomeTaxCurrent,
    },
    {
      item: "16. Chi phí thuế TNDN hoãn lại",
      code: "52",
      note: "VII.11",
      current: current.incomeTaxDeferred,
      previous: previous.incomeTaxDeferred,
    },
    {
      item: "17. Lợi nhuận sau thuế thu nhập doanh nghiệp (60 = 50 - 51 - 52)",
      code: "60",
      note: "",
      current: current.netProfit,
      previous: previous.netProfit,
      bold: true,
    },
    {
      item: "18. Lãi cơ bản trên cổ phiếu (*)",
      code: "70",
      note: "",
      current: 0,
      previous: 0,
    },
    {
      item: "19. Lãi suy giảm trên cổ phiếu (*)",
      code: "71",
      note: "",
      current: 0,
      previous: 0,
    },
  ];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildPrintableIncomeStatement(
  selectedMonth: string,
  rows: ProfitLossRow[],
  unclassifiedCount: number,
  taxRate: number | null,
) {
  const bodyRows = rows
    .map(
      (row) => `
        <tr class="${row.bold ? "bold" : ""}">
          <td>${escapeHtml(row.item)}</td>
          <td class="center">${escapeHtml(row.code)}</td>
          <td class="number">${escapeHtml(money(row.current))}</td>
          <td class="number">${escapeHtml(money(row.previous))}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FXA FITNESS - Báo cáo kết quả hoạt động kinh doanh</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: "Times New Roman", Times, serif; font-size: 16px; line-height: 1.45; color: #111; background: #f3f4f6; }
    .sheet { max-width: 1180px; margin: 0 auto; background: #fff; border: 1px solid #bbb; }
    .title { padding: 16px 12px 4px; text-align: center; font-size: 24px; font-weight: 800; text-transform: uppercase; }
    .period { padding: 12px; text-align: center; font-size: 14px; font-style: italic; border-top: 1px solid #bbb; border-bottom: 1px solid #bbb; }
    .meta { padding: 10px 12px; font-size: 14px; color: #444; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #555; padding: 6px 7px; vertical-align: middle; }
    th { background: #d9d9d9; text-align: center; font-weight: 800; }
    .center { text-align: center; white-space: nowrap; }
    .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .bold td { font-weight: 800; }
    .warning { margin: 12px; padding: 10px; border: 1px solid #d97706; background: #fffbeb; color: #92400e; font-size: 14px; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print {
      body { padding: 0; background: white; }
      .sheet { max-width: none; border: none; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="title">BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH</div>
    <div class="period">${escapeHtml(monthLabel(selectedMonth))}</div>
    <div class="meta">Đơn vị tiền tệ: CAD · ${
      taxRate === null ? "Không dùng thuế suất ước tính" : `Thuế suất ước tính: ${taxRate}%`
    }</div>
    <table>
      <thead>
        <tr>
          <th style="width: 55%">Chỉ tiêu</th>
          <th style="width: 10%">Mã số</th>
          <th style="width: 17.5%">Kỳ này</th>
          <th style="width: 17.5%">Kỳ trước</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${
      unclassifiedCount > 0
        ? `<div class="warning">Còn ${unclassifiedCount} giao dịch chưa được chọn nhóm chính thức.</div>`
        : ""
    }
  </main>
</body>
</html>`;
}

function SectionCard(props: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-yellow-500/20 bg-white/[0.055] p-4 shadow-2xl md:p-5 ${props.className || ""}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-yellow-400">
        {props.eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-bold text-white md:text-2xl">{props.title}</h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function KpiCard(props: {
  label: string;
  value: string;
  helper?: string;
  tone?: "yellow" | "green" | "red" | "blue" | "neutral";
}) {
  const toneClass = {
    yellow: "border-yellow-500/25 bg-yellow-400/10 text-yellow-300",
    green: "border-green-500/25 bg-green-500/10 text-green-300",
    red: "border-red-500/25 bg-red-500/10 text-red-300",
    blue: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    neutral: "border-white/10 bg-white/[0.055] text-white",
  }[props.tone || "neutral"];

  return (
    <div className={`rounded-3xl border p-4 shadow-xl ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-black md:text-3xl">{props.value}</p>
      {props.helper ? (
        <p className="mt-2 text-xs leading-5 text-gray-400">{props.helper}</p>
      ) : null}
    </div>
  );
}

export default function AdminRevenuePage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [migrationRequired, setMigrationRequired] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [debtView, setDebtView] = useState<DebtView>("receivable");
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_MONTH);

  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [payables, setPayables] = useState<BusinessPayable[]>([]);
  const [clientDebts, setClientDebts] = useState<ClientDebt[]>([]);

  const [journalSearch, setJournalSearch] = useState("");
  const [journalTypeFilter, setJournalTypeFilter] = useState<"all" | TransactionType>("all");
  const [journalGroupFilter, setJournalGroupFilter] = useState<"all" | "unclassified" | ReportGroup>("all");

  const [journalEntryMode, setJournalEntryMode] = useState<JournalEntryMode>("regular");
  const [selectedJournalPayableId, setSelectedJournalPayableId] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("income");
  const [transactionSource, setTransactionSource] = useState("package_sale");
  const [transactionTitle, setTransactionTitle] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayInputDate());
  const [transactionAccountingMonth, setTransactionAccountingMonth] = useState(DEFAULT_MONTH);
  const [transactionReportGroup, setTransactionReportGroup] = useState<ReportGroup>("sales_revenue");
  const [transactionCounterparty, setTransactionCounterparty] = useState("");
  const [transactionNotes, setTransactionNotes] = useState("");

  const [payableMonth, setPayableMonth] = useState(DEFAULT_MONTH);
  const [payableType, setPayableType] = useState<PayableType>("salary");
  const [payableExpenseGroup, setPayableExpenseGroup] = useState<ExpenseGroup>("admin_expense");
  const [payableCounterparty, setPayableCounterparty] = useState("");
  const [payableTitle, setPayableTitle] = useState("");
  const [payableAmount, setPayableAmount] = useState("");
  const [payableDueDate, setPayableDueDate] = useState("");
  const [payableNotes, setPayableNotes] = useState("");

  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [classificationDrafts, setClassificationDrafts] = useState<Record<string, ReportGroup>>({});

  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transactionEditDraft, setTransactionEditDraft] = useState<TransactionEditDraft | null>(null);

  const [editingReceivableId, setEditingReceivableId] = useState<string | null>(null);
  const [receivableEditDraft, setReceivableEditDraft] = useState<ReceivableEditDraft | null>(null);
  const [editingPayableId, setEditingPayableId] = useState<string | null>(null);
  const [payableEditDraft, setPayableEditDraft] = useState<PayableEditDraft | null>(null);
  const [taxRates, setTaxRates] = useState<Record<string, string>>({});

  const isAdmin = currentRole === "admin";
  const previousMonth = previousMonthKey(selectedMonth);
  const currentTaxRate = parseOptionalTaxRate(taxRates[selectedMonth]);
  const previousTaxRate = parseOptionalTaxRate(taxRates[previousMonth]);

  async function fetchData() {
    setLoading(true);
    setMigrationRequired(false);

    const [transactionResult, payableResult, debtResult] = await Promise.all([
      supabase
        .from("business_transactions")
        .select(
          "id, transaction_type, source, title, amount, notes, created_by, transaction_date, accounting_month, report_group, counterparty, payable_id, created_at",
        )
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("business_payables")
        .select(
          "id, accounting_month, payable_type, counterparty, title, total_amount, paid_amount, due_date, expense_group, notes, status, created_by, created_at, updated_at",
        )
        .order("accounting_month", { ascending: false })
        .order("due_date", { ascending: true }),
      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, price, amount_paid, balance_due, debt_deadline, debt_month, purchase_type, status, created_at, clients(id, full_name, client_code)",
        )
        .gt("balance_due", 0)
        .order("debt_deadline", { ascending: true, nullsFirst: false }),
    ]);

    const errors = [transactionResult.error, payableResult.error, debtResult.error].filter(Boolean);

    if (errors.length > 0) {
      const combined = errors.map((error) => error?.message || "Unknown error").join(" | ");
      setMessage(combined);

      if (
        combined.includes("accounting_month") ||
        combined.includes("report_group") ||
        combined.includes("business_payables") ||
        combined.includes("debt_month")
      ) {
        setMigrationRequired(true);
      }

      setLoading(false);
      return;
    }

    const nextTransactions = (transactionResult.data || []) as BusinessTransaction[];
    const nextPayables = (payableResult.data || []) as BusinessPayable[];
    const nextDebts = (debtResult.data || []) as ClientDebt[];

    setTransactions(nextTransactions);
    setPayables(nextPayables);
    setClientDebts(nextDebts);

    setClassificationDrafts(
      Object.fromEntries(
        nextTransactions.map((row) => [row.id, row.report_group || fallbackReportGroup(row)]),
      ),
    );

    setPaymentDates((current) => {
      const next = { ...current };
      for (const payable of nextPayables) {
        if (!next[payable.id]) next[payable.id] = todayInputDate();
      }
      return next;
    });

    setLoading(false);
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("fxa_accounting_tax_rates");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, string>;
        setTaxRates(parsed);
      }
    } catch {
      // Bỏ qua dữ liệu trình duyệt bị lỗi; báo cáo vẫn dùng thuế đã ghi nhận thực tế.
    }
  }, []);

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
        await fetchData();
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

  useEffect(() => {
    if (journalEntryMode === "pay_payable") return;

    if (transactionType === "income") {
      setTransactionReportGroup("sales_revenue");
      if (transactionSource === "payroll" || transactionSource === "rent") {
        setTransactionSource("package_sale");
      }
      return;
    }

    if (transactionType === "expense") {
      setTransactionReportGroup("admin_expense");
      if (["package_sale", "membership", "personal_training", "debt_payment"].includes(transactionSource)) {
        setTransactionSource("other");
      }
      return;
    }

    setTransactionReportGroup("cash_only");
    setTransactionSource("manual");
  }, [transactionType, journalEntryMode]);

  const currentProfitLoss = useMemo(
    () => buildProfitLoss(selectedMonth, transactions, payables, currentTaxRate),
    [selectedMonth, transactions, payables, currentTaxRate],
  );

  const previousProfitLoss = useMemo(
    () => buildProfitLoss(previousMonth, transactions, payables, previousTaxRate),
    [previousMonth, transactions, payables, previousTaxRate],
  );

  const profitLossRows = useMemo(
    () => buildProfitLossRows(currentProfitLoss, previousProfitLoss),
    [currentProfitLoss, previousProfitLoss],
  );

  const selectedMonthJournal = useMemo(
    () =>
      transactions.filter(
        (transaction) => getTransactionAccountingMonth(transaction) === selectedMonth,
      ),
    [transactions, selectedMonth],
  );

  const filteredJournal = useMemo(() => {
    const cleanSearch = journalSearch.trim().toLowerCase();

    return selectedMonthJournal.filter((transaction) => {
      if (
        journalTypeFilter !== "all" &&
        transaction.transaction_type !== journalTypeFilter
      ) {
        return false;
      }

      if (journalGroupFilter === "unclassified" && transaction.report_group) {
        return false;
      }

      if (
        journalGroupFilter !== "all" &&
        journalGroupFilter !== "unclassified" &&
        fallbackReportGroup(transaction) !== journalGroupFilter
      ) {
        return false;
      }

      if (cleanSearch) {
        const searchable = [
          transaction.title,
          transaction.source,
          transaction.notes || "",
          transaction.counterparty || "",
        ]
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(cleanSearch)) return false;
      }

      return true;
    });
  }, [
    selectedMonthJournal,
    journalSearch,
    journalTypeFilter,
    journalGroupFilter,
  ]);

  const selectedClientDebts = useMemo(
    () => clientDebts.filter((debt) => getClientDebtMonth(debt) === selectedMonth),
    [clientDebts, selectedMonth],
  );

  const selectedPayables = useMemo(
    () =>
      payables.filter(
        (payable) => normalizeMonthKey(payable.accounting_month) === selectedMonth,
      ),
    [payables, selectedMonth],
  );

  const openPayables = useMemo(
    () =>
      payables.filter(
        (payable) =>
          payable.status !== "paid" &&
          payable.status !== "cancelled" &&
          toNumber(payable.total_amount) > toNumber(payable.paid_amount),
      ),
    [payables],
  );

  const summary = useMemo(() => {
    const cashTransactions = transactions.filter(
      (transaction) => normalizeMonthKey(transaction.transaction_date) === selectedMonth,
    );

    const cashIncome = cashTransactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Math.abs(toNumber(transaction.amount)), 0);

    const cashExpense = cashTransactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + Math.abs(toNumber(transaction.amount)), 0);

    const cashAdjustment = cashTransactions
      .filter((transaction) => transaction.transaction_type === "cash_adjustment")
      .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);

    const allCash = transactions.reduce((sum, transaction) => {
      const amount = Math.abs(toNumber(transaction.amount));
      if (transaction.transaction_type === "income") return sum + amount;
      if (transaction.transaction_type === "expense") return sum - amount;
      return sum + toNumber(transaction.amount);
    }, 0);

    const selectedReceivables = selectedClientDebts.reduce(
      (sum, debt) => sum + toNumber(debt.balance_due),
      0,
    );

    const allReceivables = clientDebts.reduce(
      (sum, debt) => sum + toNumber(debt.balance_due),
      0,
    );

    const selectedPayableBalance = selectedPayables
      .filter((payable) => payable.status !== "cancelled")
      .reduce(
        (sum, payable) =>
          sum + Math.max(toNumber(payable.total_amount) - toNumber(payable.paid_amount), 0),
        0,
      );

    const allPayableBalance = payables
      .filter((payable) => payable.status !== "cancelled")
      .reduce(
        (sum, payable) =>
          sum + Math.max(toNumber(payable.total_amount) - toNumber(payable.paid_amount), 0),
        0,
      );

    const overdueReceivables = clientDebts.filter(
      (debt) =>
        toNumber(debt.balance_due) > 0 &&
        Boolean(debt.debt_deadline) &&
        String(debt.debt_deadline) < todayInputDate(),
    ).length;

    const overduePayables = payables.filter(
      (payable) =>
        payable.status !== "paid" &&
        payable.status !== "cancelled" &&
        Boolean(payable.due_date) &&
        String(payable.due_date) < todayInputDate(),
    ).length;

    return {
      cashIncome,
      cashExpense,
      cashAdjustment,
      cashNet: cashIncome + cashAdjustment - cashExpense,
      allCash,
      selectedReceivables,
      allReceivables,
      selectedPayableBalance,
      allPayableBalance,
      overdueReceivables,
      overduePayables,
    };
  }, [transactions, selectedMonth, selectedClientDebts, clientDebts, selectedPayables, payables]);

  const ledgerGroups = useMemo(() => {
    const groups = REPORT_GROUP_OPTIONS.filter((option) => option.value !== "cash_only").map(
      (option) => {
        const transactionTotal = selectedMonthJournal
          .filter(
            (transaction) =>
              !transaction.payable_id && fallbackReportGroup(transaction) === option.value,
          )
          .reduce((sum, transaction) => sum + Math.abs(toNumber(transaction.amount)), 0);

        const payableTotal = selectedPayables
          .filter(
            (payable) =>
              payable.status !== "cancelled" && payable.expense_group === option.value,
          )
          .reduce((sum, payable) => sum + toNumber(payable.total_amount), 0);

        return {
          key: option.value,
          label: option.label,
          transactionTotal,
          payableTotal,
          total: transactionTotal + payableTotal,
        };
      },
    );

    return groups.filter((group) => group.total !== 0);
  }, [selectedMonthJournal, selectedPayables]);

  function updateTaxRate(value: string) {
    if (!isAdmin) {
      setMessage("Chỉ admin được nhập thuế suất ước tính.");
      return;
    }

    if (value !== "") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setMessage("Thuế suất phải từ 0% đến 100%, hoặc để trống.");
        return;
      }
    }

    const next = { ...taxRates };
    if (value === "") delete next[selectedMonth];
    else next[selectedMonth] = value;

    setTaxRates(next);
    window.localStorage.setItem("fxa_accounting_tax_rates", JSON.stringify(next));
    setMessage(
      value === ""
        ? "Đã bỏ thuế suất ước tính."
        : `Đã dùng thuế suất ước tính ${value}% cho ${monthLabel(selectedMonth)}.`,
    );
  }

  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isAdmin) {
      setMessage("Chỉ admin được thêm giao dịch.");
      return;
    }

    const parsedAmount = Number(transactionAmount);

    if (journalEntryMode === "pay_payable") {
      const payable = payables.find((row) => row.id === selectedJournalPayableId);

      if (!payable) {
        setMessage("Hãy chọn khoản công nợ cần thanh toán.");
        return;
      }

      const remaining = Math.max(
        toNumber(payable.total_amount) - toNumber(payable.paid_amount),
        0,
      );

      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setMessage("Số tiền thanh toán phải lớn hơn 0.");
        return;
      }

      if (parsedAmount > remaining) {
        setMessage("Số tiền thanh toán lớn hơn số công nợ còn lại.");
        return;
      }

      const confirmed = window.confirm(
        `Thanh toán ${money(parsedAmount)} cho ${payable.counterparty}?\n\n` +
          `Khoản này thuộc ${monthLabel(normalizeMonthKey(payable.accounting_month))}.\n` +
          `Ngày trả tiền: ${formatDate(transactionDate)}.`,
      );

      if (!confirmed) return;

      setSaving(true);
      const { error } = await supabase.rpc("pay_business_payable", {
        p_payable_id: payable.id,
        p_amount: parsedAmount,
        p_payment_date: transactionDate,
        p_notes: null,
      });

      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }

      setSelectedJournalPayableId("");
      setTransactionAmount("");
      setMessage("Đã thanh toán công nợ và ghi khoản chi vào Nhật ký thu chi.");
      setSaving(false);
      await fetchData();
      return;
    }

    if (!transactionTitle.trim()) {
      setMessage("Vui lòng nhập nội dung giao dịch.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      setMessage("Số tiền phải khác 0.");
      return;
    }

    if (transactionType !== "cash_adjustment" && parsedAmount < 0) {
      setMessage("Khoản thu và khoản chi nhập số dương. Điều chỉnh tiền mặt có thể nhập số âm.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("business_transactions").insert({
      transaction_type: transactionType,
      source: transactionSource,
      title: transactionTitle.trim(),
      amount: parsedAmount,
      notes: transactionNotes.trim() || null,
      created_by: userData.user?.id || null,
      transaction_date: transactionDate,
      accounting_month: monthStart(transactionAccountingMonth),
      report_group: transactionReportGroup,
      counterparty: transactionCounterparty.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setTransactionTitle("");
    setTransactionAmount("");
    setTransactionCounterparty("");
    setTransactionNotes("");
    setMessage("Đã lưu giao dịch.");
    setSaving(false);
    await fetchData();
  }

  async function addPayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isAdmin) {
      setMessage("Chỉ admin được thêm công nợ phải trả.");
      return;
    }

    const parsedAmount = Number(payableAmount);

    if (!payableCounterparty.trim() || !payableTitle.trim()) {
      setMessage("Vui lòng nhập đối tượng và nội dung công nợ.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Giá trị công nợ phải lớn hơn 0.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("business_payables").insert({
      accounting_month: monthStart(payableMonth),
      payable_type: payableType,
      counterparty: payableCounterparty.trim(),
      title: payableTitle.trim(),
      total_amount: parsedAmount,
      paid_amount: 0,
      due_date: payableDueDate || null,
      expense_group: payableExpenseGroup,
      notes: payableNotes.trim() || null,
      status: "unpaid",
      created_by: userData.user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setPayableCounterparty("");
    setPayableTitle("");
    setPayableAmount("");
    setPayableDueDate("");
    setPayableNotes("");
    setMessage("Đã thêm khoản PHẢI TRẢ vào đúng tháng phát sinh.");
    setSaving(false);
    await fetchData();
  }

  async function payPayable(payable: BusinessPayable) {
    if (!isAdmin) {
      setMessage("Chỉ admin được thanh toán công nợ.");
      return;
    }

    const parsedAmount = Number(paymentAmounts[payable.id] || 0);
    const paymentDate = paymentDates[payable.id] || todayInputDate();
    const remaining = Math.max(
      toNumber(payable.total_amount) - toNumber(payable.paid_amount),
      0,
    );

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Nhập số tiền thanh toán lớn hơn 0.");
      return;
    }

    if (parsedAmount > remaining) {
      setMessage("Số tiền thanh toán vượt quá số dư công nợ.");
      return;
    }

    const confirmed = window.confirm(
      `Xác nhận thanh toán ${money(parsedAmount)} cho ${payable.counterparty}?\n\n` +
        `Chi phí thuộc ${monthLabel(normalizeMonthKey(payable.accounting_month))}.\n` +
        `Ngày thực chi: ${formatDate(paymentDate)}.`,
    );

    if (!confirmed) return;

    setSaving(true);
    const { error } = await supabase.rpc("pay_business_payable", {
      p_payable_id: payable.id,
      p_amount: parsedAmount,
      p_payment_date: paymentDate,
      p_notes: null,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setPaymentAmounts((current) => ({ ...current, [payable.id]: "" }));
    setMessage("Đã thanh toán công nợ và ghi thực chi vào sổ nhật ký.");
    setSaving(false);
    await fetchData();
  }

  function startReceivableEdit(debt: ClientDebt) {
    if (!isAdmin) return;
    setEditingReceivableId(debt.id);
    setReceivableEditDraft({
      planName: debt.plan_name || "Công nợ khách hàng",
      balanceDue: String(toNumber(debt.balance_due)),
      debtDeadline: debt.debt_deadline || "",
      debtMonth: getClientDebtMonth(debt),
    });
    setMessage("");
  }

  function cancelReceivableEdit() {
    setEditingReceivableId(null);
    setReceivableEditDraft(null);
  }

  async function saveReceivableEdit() {
    if (!isAdmin || !editingReceivableId || !receivableEditDraft) return;

    const debt = clientDebts.find((item) => item.id === editingReceivableId);
    if (!debt) {
      setMessage("Không tìm thấy khoản phải thu cần sửa.");
      return;
    }

    const nextBalance = Number(receivableEditDraft.balanceDue);
    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      setMessage("Số tiền còn phải thu phải từ 0 trở lên.");
      return;
    }

    if (!receivableEditDraft.debtMonth) {
      setMessage("Vui lòng chọn tháng khoản phải thu thuộc về.");
      return;
    }

    const balanceChanged = nextBalance !== toNumber(debt.balance_due);
    if (balanceChanged) {
      const confirmed = window.confirm(
        "Bạn đang sửa trực tiếp số dư PHẢI THU. Thao tác này chỉ dùng để sửa sai số và không tạo giao dịch thu tiền. Nếu khách vừa thanh toán, hãy ghi nhận thanh toán tại trang chi tiết khách hàng. Tiếp tục?",
      );
      if (!confirmed) return;
    }

    const updatePayload: Record<string, unknown> = {
      plan_name: receivableEditDraft.planName.trim() || "Công nợ khách hàng",
      balance_due: nextBalance,
      debt_deadline: receivableEditDraft.debtDeadline || null,
      debt_month: monthStart(receivableEditDraft.debtMonth),
    };

    const originalValue = toNumber(debt.price);
    if (originalValue > 0 && nextBalance <= originalValue) {
      updatePayload.amount_paid = Math.max(originalValue - nextBalance, 0);
    }

    setSaving(true);
    const { error } = await supabase
      .from("client_purchases")
      .update(updatePayload)
      .eq("id", editingReceivableId);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Đã cập nhật khoản PHẢI THU và tháng ghi nhận.");
    cancelReceivableEdit();
    setSaving(false);
    await fetchData();
  }

  function startPayableEdit(payable: BusinessPayable) {
    if (!isAdmin) return;
    setEditingPayableId(payable.id);
    setPayableEditDraft({
      accountingMonth: normalizeMonthKey(payable.accounting_month),
      payableType: payable.payable_type,
      expenseGroup: payable.expense_group,
      counterparty: payable.counterparty,
      title: payable.title,
      totalAmount: String(toNumber(payable.total_amount)),
      dueDate: payable.due_date || "",
      notes: payable.notes || "",
    });
    setMessage("");
  }

  function cancelPayableEdit() {
    setEditingPayableId(null);
    setPayableEditDraft(null);
  }

  async function savePayableEdit() {
    if (!isAdmin || !editingPayableId || !payableEditDraft) return;

    const payable = payables.find((item) => item.id === editingPayableId);
    if (!payable) {
      setMessage("Không tìm thấy khoản phải trả cần sửa.");
      return;
    }

    const nextTotal = Number(payableEditDraft.totalAmount);
    const alreadyPaid = toNumber(payable.paid_amount);

    if (!payableEditDraft.counterparty.trim() || !payableEditDraft.title.trim()) {
      setMessage("Vui lòng nhập người / đơn vị cần trả và nội dung khoản phải trả.");
      return;
    }

    if (!Number.isFinite(nextTotal) || nextTotal <= 0) {
      setMessage("Tổng khoản phải trả phải lớn hơn 0.");
      return;
    }

    if (nextTotal < alreadyPaid) {
      setMessage(`Không thể đặt tổng phải trả thấp hơn số đã trả ${money(alreadyPaid)}.`);
      return;
    }

    if (!payableEditDraft.accountingMonth) {
      setMessage("Vui lòng chọn tháng khoản phải trả thuộc về.");
      return;
    }

    const oldMonth = normalizeMonthKey(payable.accounting_month);
    if (oldMonth !== payableEditDraft.accountingMonth) {
      const confirmed = window.confirm(
        `Bạn đang chuyển khoản PHẢI TRẢ từ ${monthLabel(oldMonth)} sang ${monthLabel(payableEditDraft.accountingMonth)}. Chi phí sẽ được chuyển sang báo cáo của tháng mới. Tiếp tục?`,
      );
      if (!confirmed) return;
    }

    const nextStatus: BusinessPayable["status"] =
      alreadyPaid >= nextTotal ? "paid" : alreadyPaid > 0 ? "partial" : "unpaid";

    setSaving(true);
    const { error } = await supabase
      .from("business_payables")
      .update({
        accounting_month: monthStart(payableEditDraft.accountingMonth),
        payable_type: payableEditDraft.payableType,
        expense_group: payableEditDraft.expenseGroup,
        counterparty: payableEditDraft.counterparty.trim(),
        title: payableEditDraft.title.trim(),
        total_amount: nextTotal,
        due_date: payableEditDraft.dueDate || null,
        notes: payableEditDraft.notes.trim() || null,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingPayableId);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Đã cập nhật khoản PHẢI TRẢ và tháng ghi nhận chi phí.");
    cancelPayableEdit();
    setSaving(false);
    await fetchData();
  }

  function startTransactionEdit(transaction: BusinessTransaction) {
    if (!isAdmin) return;

    if (transaction.payable_id) {
      setMessage("Khoản này là thanh toán công nợ phải trả. Hãy sửa tại phần công nợ để tránh lệch số dư.");
      return;
    }

    setEditingTransactionId(transaction.id);
    setTransactionEditDraft({
      transactionType: transaction.transaction_type,
      source: transaction.source || "manual",
      title: transaction.title || "",
      amount: String(Math.abs(toNumber(transaction.amount))),
      transactionDate: transaction.transaction_date?.slice(0, 10) || todayInputDate(),
      accountingMonth: getTransactionAccountingMonth(transaction),
      reportGroup: transaction.report_group || fallbackReportGroup(transaction),
      counterparty: transaction.counterparty || "",
      notes: transaction.notes || "",
    });
    setMessage("");
  }

  function cancelTransactionEdit() {
    setEditingTransactionId(null);
    setTransactionEditDraft(null);
  }

  async function saveTransactionEdit() {
    if (!isAdmin || !editingTransactionId || !transactionEditDraft) return;

    const transaction = transactions.find((item) => item.id === editingTransactionId);
    if (!transaction) {
      setMessage("Không tìm thấy giao dịch cần sửa.");
      return;
    }

    if (transaction.payable_id) {
      setMessage("Không thể sửa trực tiếp khoản thanh toán công nợ phải trả.");
      return;
    }

    const parsedAmount = Number(transactionEditDraft.amount);

    if (!transactionEditDraft.title.trim()) {
      setMessage("Vui lòng nhập nội dung giao dịch.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Số tiền phải lớn hơn 0.");
      return;
    }

    if (!transactionEditDraft.transactionDate || !transactionEditDraft.accountingMonth) {
      setMessage("Vui lòng chọn ngày thu / chi và tháng ghi nhận.");
      return;
    }

    const importantChange =
      transaction.transaction_type !== transactionEditDraft.transactionType ||
      Math.abs(toNumber(transaction.amount)) !== parsedAmount ||
      getTransactionAccountingMonth(transaction) !== transactionEditDraft.accountingMonth;

    if (importantChange) {
      const confirmed = window.confirm(
        `Xác nhận sửa giao dịch "${transaction.title}"?\n\n` +
          `Loại: ${transaction.transaction_type} → ${transactionEditDraft.transactionType}\n` +
          `Số tiền: ${money(Math.abs(toNumber(transaction.amount)))} → ${money(parsedAmount)}\n` +
          `Tháng: ${getTransactionAccountingMonth(transaction)} → ${transactionEditDraft.accountingMonth}`,
      );
      if (!confirmed) return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("business_transactions")
      .update({
        transaction_type: transactionEditDraft.transactionType,
        source: transactionEditDraft.source,
        title: transactionEditDraft.title.trim(),
        amount: parsedAmount,
        transaction_date: transactionEditDraft.transactionDate,
        accounting_month: monthStart(transactionEditDraft.accountingMonth),
        report_group: transactionEditDraft.reportGroup,
        counterparty: transactionEditDraft.counterparty.trim() || null,
        notes: transactionEditDraft.notes.trim() || null,
      })
      .eq("id", editingTransactionId);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setMessage("Đã cập nhật giao dịch thu / chi.");
    cancelTransactionEdit();
    setSaving(false);
    await fetchData();
  }

  async function saveTransactionClassification(transaction: BusinessTransaction) {
    if (!isAdmin) {
      setMessage("Chỉ admin được phân loại giao dịch.");
      return;
    }

    const reportGroup = classificationDrafts[transaction.id];
    if (!reportGroup) return;

    const { error } = await supabase
      .from("business_transactions")
      .update({
        report_group: reportGroup,
        accounting_month:
          transaction.accounting_month || monthStart(getTransactionAccountingMonth(transaction)),
      })
      .eq("id", transaction.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Đã lưu phân loại kế toán.");
    await fetchData();
  }

  async function deleteTransaction(transaction: BusinessTransaction) {
    if (!isAdmin) {
      setMessage("Chỉ admin được xóa giao dịch.");
      return;
    }

    if (transaction.payable_id) {
      setMessage("Không thể xóa trực tiếp khoản thanh toán công nợ để tránh lệch số dư.");
      return;
    }

    const confirmed = window.confirm(
      `Xóa giao dịch "${transaction.title}"? Hành động này không thể hoàn tác.`,
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("business_transactions")
      .delete()
      .eq("id", transaction.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Đã xóa giao dịch.");
    await fetchData();
  }

  async function deletePayable(payable: BusinessPayable) {
    if (!isAdmin) {
      setMessage("Chỉ admin được xóa công nợ.");
      return;
    }

    if (toNumber(payable.paid_amount) > 0) {
      setMessage("Không thể xóa công nợ đã có thanh toán.");
      return;
    }

    const confirmed = window.confirm(
      `Xóa công nợ "${payable.title}" của ${payable.counterparty}?`,
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("business_payables")
      .delete()
      .eq("id", payable.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Đã xóa công nợ chưa thanh toán.");
    await fetchData();
  }

  function exportPrintableReport() {
    const html = buildPrintableIncomeStatement(
      selectedMonth,
      profitLossRows,
      currentProfitLoss.unclassifiedCount,
      currentTaxRate,
    );

    downloadText(
      `fxa-bao-cao-ket-qua-kinh-doanh-${selectedMonth}.html`,
      html,
      "text/html;charset=utf-8;",
    );
  }

  async function exportAccountingWorkbook() {
    setMessage("");

    try {
      const XLSX = await import("xlsx");

      const workbook = XLSX.utils.book_new();

      const statementRows: Array<Array<string | number>> = [
        ["BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH", "", "", ""],
        [monthLabel(selectedMonth), "", "", ""],
        [
          `Đơn vị tiền tệ: CAD - ${
            currentTaxRate === null
              ? "Không dùng thuế suất ước tính"
              : `Thuế suất ước tính: ${currentTaxRate}%`
          }`,
          "",
          "",
          "",
        ],
        ["Chỉ tiêu", "Mã số", "Kỳ này", "Kỳ trước"],
        ...profitLossRows.map((row) => [
          row.item,
          row.code,
          row.current,
          row.previous,
        ]),
      ];

      const statementSheet = XLSX.utils.aoa_to_sheet(statementRows);
      statementSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      ];
      statementSheet["!cols"] = [
        { wch: 66 },
        { wch: 14 },
        { wch: 22 },
        { wch: 22 },
      ];

      for (let row = 4; row < statementRows.length; row += 1) {
        for (const column of [2, 3]) {
          const address = XLSX.utils.encode_cell({ r: row, c: column });
          if (statementSheet[address]) statementSheet[address].z = '#,##0.00;[Red]-#,##0.00';
        }
      }

      XLSX.utils.book_append_sheet(workbook, statementSheet, "KQHĐKD");

      const journalRows = filteredJournal.map((transaction) => ({
        "Ngày thực thu/chi": transaction.transaction_date,
        "Tính vào tháng": getTransactionAccountingMonth(transaction),
        "Loại": transaction.transaction_type,
        "Nguồn": getSourceLabel(transaction.source),
        "Nhóm báo cáo": getReportGroupLabel(transaction.report_group || fallbackReportGroup(transaction)),
        "Đối tượng": transaction.counterparty || "",
        "Nội dung": transaction.title,
        "Số tiền": toNumber(transaction.amount),
        "Ghi chú": transaction.notes || "",
      }));
      const journalSheet = XLSX.utils.json_to_sheet(journalRows);
      journalSheet["!cols"] = [
        { wch: 16 },
        { wch: 15 },
        { wch: 16 },
        { wch: 22 },
        { wch: 34 },
        { wch: 24 },
        { wch: 38 },
        { wch: 16 },
        { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(workbook, journalSheet, "Nhật ký thu chi");

      const receivableRows = selectedClientDebts.map((debt) => {
        const client = getClientRelation(debt.clients);
        return {
          "Tính vào tháng": getClientDebtMonth(debt),
          "Mã khách hàng": client?.client_code || "",
          "Khách hàng": client?.full_name || "Không rõ",
          "Nội dung": debt.plan_name || "Công nợ khách hàng",
          "Giá trị ban đầu": toNumber(debt.price),
          "Đã thu": toNumber(debt.amount_paid),
          "Còn phải thu": toNumber(debt.balance_due),
          "Hạn thanh toán": debt.debt_deadline || "",
          "Trạng thái": debt.status || "",
        };
      });
      const receivableSheet = XLSX.utils.json_to_sheet(receivableRows);
      receivableSheet["!cols"] = [
        { wch: 15 },
        { wch: 18 },
        { wch: 26 },
        { wch: 34 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(workbook, receivableSheet, "PHẢI THU");

      const payableRows = selectedPayables.map((payable) => ({
        "Tháng ghi nhận": normalizeMonthKey(payable.accounting_month),
        "Loại": getPayableTypeLabel(payable.payable_type),
        "Đối tượng": payable.counterparty,
        "Nội dung": payable.title,
        "Nhóm chi phí": getReportGroupLabel(payable.expense_group),
        "Tổng công nợ": toNumber(payable.total_amount),
        "Đã trả": toNumber(payable.paid_amount),
        "Còn phải trả": Math.max(
          toNumber(payable.total_amount) - toNumber(payable.paid_amount),
          0,
        ),
        "Hạn thanh toán": payable.due_date || "",
        "Trạng thái": payable.status,
        "Ghi chú": payable.notes || "",
      }));
      const payableSheet = XLSX.utils.json_to_sheet(payableRows);
      payableSheet["!cols"] = [
        { wch: 15 },
        { wch: 18 },
        { wch: 24 },
        { wch: 34 },
        { wch: 32 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(workbook, payableSheet, "PHẢI TRẢ  PHẢI CHI");

      const ledgerSheet = XLSX.utils.json_to_sheet(
        ledgerGroups.map((group) => ({
          "Nhóm kế toán": group.label,
          "Từ sổ nhật ký": group.transactionTotal,
          "Từ công nợ phải trả": group.payableTotal,
          "Tổng ghi nhận": group.total,
        })),
      );
      ledgerSheet["!cols"] = [
        { wch: 38 },
        { wch: 20 },
        { wch: 24 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(workbook, ledgerSheet, "Tổng hợp kế toán");

      XLSX.writeFile(workbook, `fxa-so-ke-toan-${selectedMonth}.xlsx`);
      setMessage("Đã xuất file Excel gồm báo cáo lãi lỗ, sổ nhật ký và công nợ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất Excel.");
    }
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="font-bold text-yellow-400">Đang kiểm tra quyền truy cập...</p>
      </main>
    );
  }

  return (
    <main className="fxa-accounting-page min-h-screen overflow-y-auto bg-black p-3 text-white md:p-5">
      <style jsx global>{`
        .fxa-accounting-page,
        .fxa-accounting-page input,
        .fxa-accounting-page select,
        .fxa-accounting-page textarea,
        .fxa-accounting-page button,
        .fxa-accounting-page table {
          font-family: "Times New Roman", Times, serif;
        }

        .fxa-accounting-page {
          font-size: 16px;
          line-height: 1.5;
        }

        .fxa-accounting-page .text-xs,
        .fxa-accounting-page [class*="text-[10px]"],
        .fxa-accounting-page [class*="text-[11px]"] {
          font-size: 14px !important;
          line-height: 1.45 !important;
        }

        .fxa-accounting-page .text-sm {
          font-size: 16px !important;
          line-height: 1.5 !important;
        }

        .fxa-accounting-page input,
        .fxa-accounting-page select,
        .fxa-accounting-page textarea,
        .fxa-accounting-page button {
          font-size: 16px;
        }
      `}</style>
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-[1500px]">
          <header className="rounded-3xl border border-yellow-500/25 bg-black/65 p-4 shadow-2xl md:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-400">
                  FXA FITNESS · KẾ TOÁN QUẢN TRỊ
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
                  Quản lý thu chi & công nợ
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
                  Theo dõi thu chi, công nợ và kết quả kinh doanh theo từng tháng.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Link
                  href="/admin"
                  className="rounded-xl border border-yellow-400 px-4 py-3 text-center text-xs font-bold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={fetchData}
                  className="rounded-xl border border-yellow-400 px-4 py-3 text-xs font-bold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Làm mới
                </button>
                <button
                  type="button"
                  onClick={exportPrintableReport}
                  className="rounded-xl border border-yellow-400 px-4 py-3 text-xs font-bold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Mẫu in / PDF
                </button>
                <button
                  type="button"
                  onClick={exportAccountingWorkbook}
                  className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black transition hover:bg-yellow-300"
                >
                  Xuất Excel
                </button>
              </div>
            </div>

            {currentRole === "manager" ? (
              <div className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                Chế độ Manager: được xem toàn bộ báo cáo nhưng không được thêm, sửa, xóa hoặc thanh toán.
              </div>
            ) : null}
          </header>

          <section className="mt-4 flex flex-col gap-3 rounded-3xl border border-yellow-500/20 bg-white/[0.045] p-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">
                Tháng đang xem
              </p>
              <p className="mt-1 text-2xl font-black capitalize">{monthLabel(selectedMonth)}</p>
              <p className="mt-1 text-xs text-gray-500">
                Kỳ trước: {monthLabel(previousMonth)}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="rounded-xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-bold text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setSelectedMonth(previousMonthKey(selectedMonth))}
                className="rounded-xl border border-white/15 px-4 py-3 text-xs font-bold uppercase text-gray-200 hover:border-yellow-400 hover:text-yellow-300"
              >
                Tháng trước
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth(DEFAULT_MONTH)}
                className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black hover:bg-yellow-300"
              >
                Tháng hiện tại
              </button>
            </div>
          </section>

          {message ? (
            <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm text-yellow-100">
              {message}
            </div>
          ) : null}

          {migrationRequired ? (
            <div className="mt-4 rounded-3xl border border-red-500/35 bg-red-500/10 p-5">
              <p className="font-black text-red-300">Cần chạy migration trước khi dùng page mới.</p>
              <p className="mt-2 text-sm leading-6 text-red-100/80">
                Chạy file <code className="rounded bg-black/50 px-2 py-1">supabase/migrations/20260731_accounting_structure.sql</code> trong Supabase SQL Editor, sau đó bấm Làm mới. Migration chỉ thêm cấu trúc mới và gán tháng cho dữ liệu cũ theo ngày giao dịch; không thay đổi số tiền lịch sử.
              </p>
            </div>
          ) : null}

          <nav className="mt-4 grid gap-2 rounded-3xl border border-yellow-500/20 bg-black/50 p-2 md:grid-cols-5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-4 py-3 text-left transition ${
                  activeTab === tab.key
                    ? "bg-yellow-400 text-black"
                    : "bg-white/[0.04] text-white hover:bg-white/[0.08]"
                }`}
              >
                <p className="text-sm font-black">{tab.label}</p>
                <p
                  className={`mt-1 text-[11px] leading-4 ${
                    activeTab === tab.key ? "text-black/65" : "text-gray-500"
                  }`}
                >
                  {tab.description}
                </p>
              </button>
            ))}
          </nav>

          {loading ? (
            <section className="mt-4 rounded-3xl border border-yellow-500/20 bg-white/[0.05] p-12 text-center">
              <p className="font-bold text-yellow-400">Đang tải dữ liệu kế toán...</p>
            </section>
          ) : (
            <>
              {activeTab === "overview" ? (
                <div className="mt-4 space-y-4">
                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      label="Thực thu trong tháng"
                      value={money(summary.cashIncome)}
                      helper="Theo ngày tiền thực tế vào quỹ / tài khoản."
                      tone="green"
                    />
                    <KpiCard
                      label="Thực chi trong tháng"
                      value={money(summary.cashExpense)}
                      helper="Theo ngày tiền thực tế đã chi."
                      tone="red"
                    />
                    <KpiCard
                      label="Dòng tiền ròng tháng"
                      value={money(summary.cashNet)}
                      helper={`Bao gồm điều chỉnh tiền mặt ${money(summary.cashAdjustment)}.`}
                      tone={summary.cashNet >= 0 ? "yellow" : "red"}
                    />
                    <KpiCard
                      label="Dòng tiền lũy kế"
                      value={money(summary.allCash)}
                      helper="Tổng tiền đã thu, trừ tiền đã chi và cộng các điều chỉnh."
                      tone="blue"
                    />
                  </section>

                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      label="Doanh thu ghi nhận"
                      value={money(currentProfitLoss.netRevenue)}
                      helper="Chỉ tiền thực thu được gán vào kỳ báo cáo."
                      tone="green"
                    />
                    <KpiCard
                      label="Chi phí ghi nhận"
                      value={money(
                        currentProfitLoss.costOfSales +
                          currentProfitLoss.financialExpense +
                          currentProfitLoss.sellingExpense +
                          currentProfitLoss.adminExpense +
                          currentProfitLoss.otherExpense +
                          currentProfitLoss.incomeTaxCurrent +
                          currentProfitLoss.incomeTaxDeferred,
                      )}
                      helper="Bao gồm chi phí công nợ thuộc tháng, dù chưa thanh toán."
                      tone="red"
                    />
                    <KpiCard
                      label="Lợi nhuận sau thuế"
                      value={money(currentProfitLoss.netProfit)}
                      helper="Kết quả của tháng đang xem."
                      tone={currentProfitLoss.netProfit >= 0 ? "yellow" : "red"}
                    />
                    <KpiCard
                      label="Giao dịch cần kiểm tra"
                      value={String(currentProfitLoss.unclassifiedCount)}
                      helper="Cần chọn đúng nhóm trước khi xuất báo cáo cuối tháng."
                      tone={currentProfitLoss.unclassifiedCount > 0 ? "red" : "green"}
                    />
                  </section>

                  <section className="grid gap-4 xl:grid-cols-2">
                    <SectionCard eyebrow="PHẢI THU" title="Khách hàng còn phải trả cho FXA">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <KpiCard
                          label={`Tính vào ${monthLabel(selectedMonth)}`}
                          value={money(summary.selectedReceivables)}
                          helper={`${selectedClientDebts.length} khoản công nợ`}
                          tone="yellow"
                        />
                        <KpiCard
                          label="Tổng còn phải thu"
                          value={money(summary.allReceivables)}
                          helper={`${summary.overdueReceivables} khoản đã quá hạn`}
                          tone={summary.overdueReceivables > 0 ? "red" : "neutral"}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard eyebrow="PHẢI TRẢ  PHẢI CHI" title="FXA còn phải trả cho nhân viên hoặc nhà cung cấp">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <KpiCard
                          label={`Tính vào ${monthLabel(selectedMonth)}`}
                          value={money(summary.selectedPayableBalance)}
                          helper={`${selectedPayables.length} khoản công nợ`}
                          tone="yellow"
                        />
                        <KpiCard
                          label="Tổng còn phải trả"
                          value={money(summary.allPayableBalance)}
                          helper={`${summary.overduePayables} khoản đã quá hạn`}
                          tone={summary.overduePayables > 0 ? "red" : "neutral"}
                        />
                      </div>
                    </SectionCard>
                  </section>


                </div>
              ) : null}

              {activeTab === "journal" ? (
                <div className="mt-4 space-y-4">
                  <SectionCard eyebrow="Nhật ký thu chi" title="Thêm khoản thu hoặc chi">
                    <form onSubmit={addTransaction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                      <label className="grid gap-1 md:col-span-2 xl:col-span-2">
                        <span className="text-xs font-bold text-gray-400">Bạn muốn ghi khoản nào?</span>
                        <select
                          value={journalEntryMode}
                          onChange={(event) => {
                            const mode = event.target.value as JournalEntryMode;
                            setJournalEntryMode(mode);
                            setMessage("");
                            setTransactionAmount("");
                            if (mode === "pay_payable") {
                              setTransactionType("expense");
                              setTransactionSource("payable_payment");
                              setTransactionReportGroup("cash_only");
                            } else {
                              setSelectedJournalPayableId("");
                              setTransactionType("income");
                              setTransactionSource("package_sale");
                              setTransactionReportGroup("sales_revenue");
                            }
                          }}
                          disabled={!isAdmin}
                          className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-50"
                        >
                          <option value="regular">Thu hoặc chi thông thường</option>
                          <option value="pay_payable">Thanh toán khoản phải trả đã có</option>
                        </select>
                      </label>

                      {journalEntryMode === "pay_payable" ? (
                        <>
                          <label className="grid gap-1 md:col-span-2 xl:col-span-4">
                            <span className="text-xs font-bold text-gray-400">Chọn khoản phải trả</span>
                            <select
                              value={selectedJournalPayableId}
                              onChange={(event) => {
                                const payableId = event.target.value;
                                setSelectedJournalPayableId(payableId);
                                const payable = openPayables.find((row) => row.id === payableId);
                                if (payable) {
                                  const remaining = Math.max(
                                    toNumber(payable.total_amount) - toNumber(payable.paid_amount),
                                    0,
                                  );
                                  setTransactionAmount(remaining.toFixed(2));
                                } else {
                                  setTransactionAmount("");
                                }
                              }}
                              disabled={!isAdmin || openPayables.length === 0}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-50"
                            >
                              <option value="">Chọn một khoản công nợ</option>
                              {openPayables.map((payable) => {
                                const remaining = Math.max(
                                  toNumber(payable.total_amount) - toNumber(payable.paid_amount),
                                  0,
                                );
                                return (
                                  <option key={payable.id} value={payable.id}>
                                    {payable.counterparty} — {payable.title} — còn {money(remaining)} — thuộc {monthLabel(normalizeMonthKey(payable.accounting_month))}
                                  </option>
                                );
                              })}
                            </select>
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="text-xs font-bold text-gray-400">Ngày trả tiền</span>
                            <input
                              type="date"
                              value={transactionDate}
                              onChange={(event) => setTransactionDate(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="text-xs font-bold text-gray-400">Số tiền trả</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={transactionAmount}
                              onChange={(event) => setTransactionAmount(event.target.value)}
                              placeholder="0.00"
                              disabled={!isAdmin || !selectedJournalPayableId}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <div className="flex items-end xl:col-span-2">
                            <button
                              disabled={!isAdmin || saving || !selectedJournalPayableId}
                              className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:opacity-50"
                            >
                              {saving ? "Đang lưu..." : "Thanh toán và ghi sổ"}
                            </button>
                          </div>

                          {openPayables.length === 0 ? (
                            <p className="md:col-span-2 xl:col-span-6 text-sm text-gray-400">Không có khoản phải trả nào đang chờ thanh toán.</p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <label className="grid gap-1 xl:col-span-1">
                            <span className="text-xs font-bold text-gray-400">Thu hay chi?</span>
                            <select
                              value={transactionType}
                              onChange={(event) => setTransactionType(event.target.value as TransactionType)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-50"
                            >
                              <option value="income">Thu tiền</option>
                              <option value="expense">Chi tiền</option>
                              <option value="cash_adjustment">Điều chỉnh tiền mặt</option>
                            </select>
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="text-xs font-bold text-gray-400">Khoản tiền này là gì?</span>
                            <select
                              value={transactionSource}
                              onChange={(event) => setTransactionSource(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-50"
                            >
                              {SOURCE_OPTIONS.filter((option) => option.value !== "payable_payment").map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1 xl:col-span-1">
                            <span className="text-xs font-bold text-gray-400">Ngày thu / chi</span>
                            <input
                              type="date"
                              value={transactionDate}
                              onChange={(event) => setTransactionDate(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="text-xs font-bold text-gray-400">Tính vào tháng nào?</span>
                            <input
                              type="month"
                              value={transactionAccountingMonth}
                              onChange={(event) => setTransactionAccountingMonth(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-3">
                            <span className="text-xs font-bold text-gray-400">Nội dung</span>
                            <input
                              value={transactionTitle}
                              onChange={(event) => setTransactionTitle(event.target.value)}
                              placeholder="Ví dụ: Thu tiền gói tập của Nguyễn Văn A"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-1">
                            <span className="text-xs font-bold text-gray-400">Số tiền</span>
                            <input
                              type="number"
                              step="0.01"
                              value={transactionAmount}
                              onChange={(event) => setTransactionAmount(event.target.value)}
                              placeholder="0.00"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="text-xs font-bold text-gray-400">Người trả / người nhận</span>
                            <input
                              value={transactionCounterparty}
                              onChange={(event) => setTransactionCounterparty(event.target.value)}
                              placeholder="Tên khách hàng, nhân viên hoặc nhà cung cấp"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-3">
                            <span className="text-xs font-bold text-gray-400">Tính vào nhóm nào?</span>
                            <select
                              value={transactionReportGroup}
                              onChange={(event) => setTransactionReportGroup(event.target.value as ReportGroup)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-sm text-black outline-none disabled:opacity-50"
                            >
                              {REPORT_GROUP_OPTIONS.filter((option) =>
                                option.transactionTypes.includes(transactionType),
                              ).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="text-xs font-bold text-gray-400">Ghi chú (không bắt buộc)</span>
                            <input
                              value={transactionNotes}
                              onChange={(event) => setTransactionNotes(event.target.value)}
                              placeholder="Có thể để trống"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                            />
                          </label>

                          <div className="flex items-end xl:col-span-1">
                            <button
                              disabled={!isAdmin || saving}
                              className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:opacity-50"
                            >
                              {saving ? "Đang lưu..." : "Lưu giao dịch"}
                            </button>
                          </div>
                        </>
                      )}
                    </form>
                  </SectionCard>

                  <SectionCard eyebrow="Nhật ký thu chi" title={`Thu chi của ${monthLabel(selectedMonth)}`}>
                    <div className="mb-4 grid gap-2 md:grid-cols-4">
                      <select
                        value={journalTypeFilter}
                        onChange={(event) => setJournalTypeFilter(event.target.value as "all" | TransactionType)}
                        className="rounded-xl border border-yellow-500/30 bg-white px-3 py-2 text-sm text-black"
                      >
                        <option value="all">Tất cả loại</option>
                        <option value="income">Thu tiền</option>
                        <option value="expense">Chi tiền</option>
                        <option value="cash_adjustment">Điều chỉnh tiền mặt</option>
                      </select>

                      <select
                        value={journalGroupFilter}
                        onChange={(event) =>
                          setJournalGroupFilter(event.target.value as "all" | "unclassified" | ReportGroup)
                        }
                        className="rounded-xl border border-yellow-500/30 bg-white px-3 py-2 text-sm text-black"
                      >
                        <option value="all">Tất cả nhóm</option>
                        <option value="unclassified">Chưa phân loại</option>
                        {REPORT_GROUP_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <input
                        value={journalSearch}
                        onChange={(event) => setJournalSearch(event.target.value)}
                        placeholder="Tìm nội dung hoặc người / đơn vị..."
                        className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-2 text-sm text-white outline-none md:col-span-2"
                      />
                    </div>

                    {editingTransactionId && transactionEditDraft ? (
                      <div className="mb-5 rounded-3xl border border-yellow-400/35 bg-yellow-400/10 p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-black text-yellow-200">Sửa giao dịch thu / chi</p>
                            <p className="mt-1 text-sm text-yellow-100/75">
                              Có thể sửa loại giao dịch, nguồn, ngày, tháng ghi nhận, nội dung, số tiền, đối tượng, nhóm báo cáo và ghi chú.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={cancelTransactionEdit}
                            className="rounded-xl border border-white/20 px-4 py-2 font-bold text-white hover:border-white/50"
                          >
                            Đóng
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Thu hay chi?</span>
                            <select
                              value={transactionEditDraft.transactionType}
                              onChange={(event) => {
                                const nextType = event.target.value as TransactionType;
                                setTransactionEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        transactionType: nextType,
                                        reportGroup:
                                          nextType === "income"
                                            ? "sales_revenue"
                                            : nextType === "expense"
                                              ? "admin_expense"
                                              : "cash_only",
                                      }
                                    : current,
                                );
                              }}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black"
                            >
                              <option value="income">Thu tiền</option>
                              <option value="expense">Chi tiền</option>
                              <option value="cash_adjustment">Điều chỉnh tiền mặt</option>
                            </select>
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="font-bold text-gray-300">Khoản tiền này là gì?</span>
                            <select
                              value={transactionEditDraft.source}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, source: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black"
                            >
                              {SOURCE_OPTIONS.filter((option) => option.value !== "payable_payment").map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Ngày thu / chi</span>
                            <input
                              type="date"
                              value={transactionEditDraft.transactionDate}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, transactionDate: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                            />
                          </label>

                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Tính vào tháng</span>
                            <input
                              type="month"
                              value={transactionEditDraft.accountingMonth}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, accountingMonth: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                            />
                          </label>

                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Số tiền</span>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={transactionEditDraft.amount}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, amount: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-3">
                            <span className="font-bold text-gray-300">Nội dung</span>
                            <input
                              value={transactionEditDraft.title}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, title: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-2">
                            <span className="font-bold text-gray-300">Người trả / người nhận</span>
                            <input
                              value={transactionEditDraft.counterparty}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, counterparty: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                            />
                          </label>

                          <label className="grid gap-1 xl:col-span-3">
                            <span className="font-bold text-gray-300">Phân loại kế toán</span>
                            <select
                              value={transactionEditDraft.reportGroup}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current
                                    ? { ...current, reportGroup: event.target.value as ReportGroup }
                                    : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black"
                            >
                              {REPORT_GROUP_OPTIONS.filter((option) =>
                                option.transactionTypes.includes(transactionEditDraft.transactionType),
                              ).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="grid gap-1 xl:col-span-3">
                            <span className="font-bold text-gray-300">Ghi chú</span>
                            <input
                              value={transactionEditDraft.notes}
                              onChange={(event) =>
                                setTransactionEditDraft((current) =>
                                  current ? { ...current, notes: event.target.value } : current,
                                )
                              }
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                            />
                          </label>

                          <div className="flex items-end justify-end gap-2 xl:col-span-6">
                            <button
                              type="button"
                              onClick={cancelTransactionEdit}
                              className="rounded-xl border border-white/20 px-4 py-3 font-bold text-white"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={saveTransactionEdit}
                              disabled={saving}
                              className="rounded-xl bg-yellow-400 px-5 py-3 font-black text-black disabled:opacity-50"
                            >
                              {saving ? "Đang lưu..." : "Lưu thay đổi"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {filteredJournal.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                        Không có giao dịch phù hợp.
                      </p>
                    ) : (
                      <div className="max-h-[620px] overflow-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[1320px] border-collapse text-left text-xs">
                          <thead className="sticky top-0 bg-yellow-400 text-black">
                            <tr>
                              <th className="p-3">Ngày thu / chi</th>
                              <th className="p-3">Tính vào tháng</th>
                              <th className="p-3">Loại</th>
                              <th className="p-3">Khoản thu / chi</th>
                              <th className="p-3">Người trả / nhận</th>
                              <th className="p-3">Nội dung</th>
                              <th className="p-3">Nhóm báo cáo</th>
                              <th className="p-3 text-right">Số tiền</th>
                              <th className="p-3 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJournal.map((transaction, index) => {
                              const amountValue = Math.abs(toNumber(transaction.amount));
                              const sign = getTransactionSign(transaction);
                              const linkedPayable = Boolean(transaction.payable_id);

                              return (
                                <tr
                                  key={transaction.id}
                                  className={`border-b border-white/10 ${
                                    index % 2 === 0 ? "bg-black/45" : "bg-white/[0.035]"
                                  }`}
                                >
                                  <td className="p-3 text-gray-300">{formatDate(transaction.transaction_date)}</td>
                                  <td className="p-3 text-gray-300">{getTransactionAccountingMonth(transaction)}</td>
                                  <td className="p-3">
                                    <span
                                      className={`rounded-full border px-2 py-1 font-bold uppercase ${
                                        transaction.transaction_type === "income"
                                          ? "border-green-400/30 bg-green-400/10 text-green-300"
                                          : transaction.transaction_type === "expense"
                                            ? "border-red-400/30 bg-red-400/10 text-red-300"
                                            : "border-blue-400/30 bg-blue-400/10 text-blue-300"
                                      }`}
                                    >
                                      {transaction.transaction_type === "income"
                                        ? "Thu"
                                        : transaction.transaction_type === "expense"
                                          ? "Chi"
                                          : "Điều chỉnh"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-gray-300">{getSourceLabel(transaction.source)}</td>
                                  <td className="p-3">
                                    <p className="text-white">{transaction.counterparty || "-"}</p>
                                  </td>
                                  <td className="p-3">
                                    <p className="font-bold text-white">{transaction.title}</p>
                                    {transaction.notes ? (
                                      <p className="mt-1 max-w-md text-[11px] leading-4 text-gray-500">{transaction.notes}</p>
                                    ) : null}
                                    {linkedPayable ? (
                                      <p className="mt-1 text-[11px] font-bold text-blue-300">Thanh toán khoản phải trả · chỉ cập nhật dòng tiền</p>
                                    ) : null}
                                  </td>
                                  <td className="p-3">
                                    <select
                                      value={classificationDrafts[transaction.id] || fallbackReportGroup(transaction)}
                                      onChange={(event) =>
                                        setClassificationDrafts((current) => ({
                                          ...current,
                                          [transaction.id]: event.target.value as ReportGroup,
                                        }))
                                      }
                                      disabled={!isAdmin || linkedPayable}
                                      className="w-64 rounded-lg border border-yellow-500/25 bg-white px-2 py-2 text-xs text-black disabled:opacity-60"
                                    >
                                      {REPORT_GROUP_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    {!transaction.report_group ? (
                                      <p className="mt-1 text-[10px] font-bold text-orange-300">Chưa lưu nhóm chính thức</p>
                                    ) : null}
                                  </td>
                                  <td
                                    className={`p-3 text-right text-sm font-black ${
                                      sign >= 0 ? "text-green-300" : "text-red-300"
                                    }`}
                                  >
                                    {sign >= 0 ? "+" : "-"}{money(amountValue)}
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex justify-end gap-2">
                                      {isAdmin && !linkedPayable ? (
                                        <button
                                          type="button"
                                          onClick={() => startTransactionEdit(transaction)}
                                          className="rounded-lg border border-cyan-400 px-2 py-2 font-bold text-cyan-300 hover:bg-cyan-400 hover:text-black"
                                        >
                                          Sửa
                                        </button>
                                      ) : null}
                                      {isAdmin && !linkedPayable ? (
                                        <button
                                          type="button"
                                          onClick={() => saveTransactionClassification(transaction)}
                                          className="rounded-lg border border-yellow-400 px-2 py-2 font-bold text-yellow-300 hover:bg-yellow-400 hover:text-black"
                                        >
                                          Lưu phân loại
                                        </button>
                                      ) : null}
                                      {isAdmin && !linkedPayable ? (
                                        <button
                                          type="button"
                                          onClick={() => deleteTransaction(transaction)}
                                          className="rounded-lg border border-red-400 px-2 py-2 font-bold text-red-300 hover:bg-red-400 hover:text-black"
                                        >
                                          Xóa
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>
                </div>
              ) : null}

              {activeTab === "debt" ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 rounded-3xl border border-yellow-500/20 bg-black/50 p-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setDebtView("receivable")}
                      className={`rounded-2xl px-5 py-4 text-left transition ${
                        debtView === "receivable" ? "bg-yellow-400 text-black" : "bg-white/[0.04]"
                      }`}
                    >
                      <p className="font-black">PHẢI THU — Khách hàng nợ FXA</p>
                      <p className={`mt-1 text-xs ${debtView === "receivable" ? "text-black/70" : "text-gray-400"}`}>
                        Tiền khách hàng còn phải thanh toán cho phòng tập
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebtView("payable")}
                      className={`rounded-2xl px-5 py-4 text-left transition ${
                        debtView === "payable" ? "bg-yellow-400 text-black" : "bg-white/[0.04]"
                      }`}
                    >
                      <p className="font-black">PHẢI TRẢ / PHẢI CHI — FXA nợ người khác</p>
                      <p className={`mt-1 text-xs ${debtView === "payable" ? "text-black/70" : "text-gray-400"}`}>
                        Lương, hoa hồng, tiền thuê, nhà cung cấp, thuế và khoản phải chi khác
                      </p>
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-3xl border border-green-400/25 bg-green-400/10 p-5">
                      <p className="font-black text-green-200">PHẢI THU tính vào tháng nào?</p>
                      <p className="mt-2 text-sm leading-6 text-green-100/80">
                        Khoản phải thu nằm trong tháng đã chọn. Chỉ khi khách hàng trả tiền, khoản đó mới trở thành tiền đã thu.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-red-400/25 bg-red-400/10 p-5">
                      <p className="font-black text-red-200">PHẢI TRẢ / PHẢI CHI tính vào tháng nào?</p>
                      <p className="mt-2 text-sm leading-6 text-red-100/80">
                        Khoản phải trả được tính vào tháng phát sinh. Ngày thanh toán chỉ ghi nhận tiền đã chi.
                      </p>
                    </div>
                  </div>

                  {debtView === "receivable" ? (
                    <SectionCard
                      eyebrow="PHẢI THU — KHÁCH HÀNG TRẢ CHO FXA"
                      title={`Khoản phải thu được ghi nhận vào ${monthLabel(selectedMonth)}`}
                    >
                      <div className="mb-4 grid gap-3 sm:grid-cols-3">
                        <KpiCard label="Còn phải thu trong tháng" value={money(summary.selectedReceivables)} tone="yellow" />
                        <KpiCard label="Số khoản phải thu" value={String(selectedClientDebts.length)} tone="neutral" />
                        <KpiCard label="Tổng phải thu toàn hệ thống" value={money(summary.allReceivables)} tone="blue" />
                      </div>

                      {editingReceivableId && receivableEditDraft ? (
                        <div className="mb-5 rounded-3xl border border-yellow-400/35 bg-yellow-400/10 p-5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-black text-yellow-200">Sửa khoản PHẢI THU</p>
                              <p className="mt-1 text-sm text-yellow-100/75">
                                Chỉ dùng để sửa sai số, nội dung, hạn trả hoặc tháng ghi nhận. Không dùng thay cho thao tác thu tiền.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={cancelReceivableEdit}
                              className="rounded-xl border border-white/20 px-4 py-2 font-bold text-white hover:border-white/50"
                            >
                              Đóng
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <label className="grid gap-1 xl:col-span-2">
                              <span className="font-bold text-gray-300">Nội dung khoản phải thu</span>
                              <input
                                value={receivableEditDraft.planName}
                                onChange={(event) =>
                                  setReceivableEditDraft((current) =>
                                    current ? { ...current, planName: event.target.value } : current,
                                  )
                                }
                                className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white outline-none"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="font-bold text-gray-300">Còn phải thu (CAD)</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={receivableEditDraft.balanceDue}
                                onChange={(event) =>
                                  setReceivableEditDraft((current) =>
                                    current ? { ...current, balanceDue: event.target.value } : current,
                                  )
                                }
                                className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white outline-none"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="font-bold text-gray-300">Hạn khách thanh toán</span>
                              <input
                                type="date"
                                value={receivableEditDraft.debtDeadline}
                                onChange={(event) =>
                                  setReceivableEditDraft((current) =>
                                    current ? { ...current, debtDeadline: event.target.value } : current,
                                  )
                                }
                                className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white outline-none"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="font-bold text-gray-300">Tính vào báo cáo công nợ tháng</span>
                              <input
                                type="month"
                                value={receivableEditDraft.debtMonth}
                                onChange={(event) =>
                                  setReceivableEditDraft((current) =>
                                    current ? { ...current, debtMonth: event.target.value } : current,
                                  )
                                }
                                className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white outline-none"
                              />
                            </label>
                            <div className="flex items-end gap-2 xl:col-span-3 xl:justify-end">
                              <button
                                type="button"
                                onClick={cancelReceivableEdit}
                                className="rounded-xl border border-white/20 px-4 py-3 font-bold text-white"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={saveReceivableEdit}
                                disabled={saving}
                                className="rounded-xl bg-yellow-400 px-5 py-3 font-black text-black disabled:opacity-50"
                              >
                                {saving ? "Đang lưu..." : "Lưu khoản phải thu"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {selectedClientDebts.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                          Không có khoản PHẢI THU được ghi nhận vào tháng này.
                        </p>
                      ) : (
                        <div className="overflow-auto rounded-2xl border border-white/10">
                          <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
                            <thead className="bg-yellow-400 text-black">
                              <tr>
                                <th className="p-3">Loại công nợ</th>
                                <th className="p-3">Khách hàng</th>
                                <th className="p-3">Nội dung</th>
                                <th className="p-3 text-right">Đã thu</th>
                                <th className="p-3 text-right">Còn phải thu</th>
                                <th className="p-3">Hạn thanh toán</th>
                                <th className="p-3">Tính vào tháng</th>
                                <th className="p-3 text-right">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedClientDebts.map((debt, index) => {
                                const client = getClientRelation(debt.clients);
                                const overdue =
                                  Boolean(debt.debt_deadline) &&
                                  String(debt.debt_deadline) < todayInputDate();

                                return (
                                  <tr
                                    key={debt.id}
                                    className={`border-b border-white/10 ${
                                      index % 2 === 0 ? "bg-black/45" : "bg-white/[0.035]"
                                    }`}
                                  >
                                    <td className="p-3">
                                      <span className="rounded-full border border-green-400/35 bg-green-400/10 px-3 py-1 font-black text-green-200">
                                        PHẢI THU
                                      </span>
                                    </td>
                                    <td className="p-3">
                                      <p className="font-bold text-white">{client?.full_name || "Không rõ khách hàng"}</p>
                                      <p className="mt-1 text-xs text-gray-500">{client?.client_code || debt.client_id}</p>
                                    </td>
                                    <td className="p-3 text-gray-300">{debt.plan_name || "Công nợ khách hàng"}</td>
                                    <td className="p-3 text-right text-green-300">{money(debt.amount_paid)}</td>
                                    <td className="p-3 text-right font-black text-yellow-300">{money(debt.balance_due)}</td>
                                    <td className={`p-3 ${overdue ? "font-bold text-red-300" : "text-gray-300"}`}>
                                      {formatDate(debt.debt_deadline)}
                                      {overdue ? <p className="mt-1 text-xs">Quá hạn</p> : null}
                                    </td>
                                    <td className="p-3">
                                      <p className="font-bold text-white">{monthLabel(getClientDebtMonth(debt))}</p>
                                      <p className="mt-1 text-xs text-gray-500">Chỉ vào báo cáo công nợ, chưa phải doanh thu đã thu</p>
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex justify-end gap-2">
                                        {isAdmin ? (
                                          <button
                                            type="button"
                                            onClick={() => startReceivableEdit(debt)}
                                            className="rounded-lg border border-yellow-400 px-3 py-2 font-bold text-yellow-300 hover:bg-yellow-400 hover:text-black"
                                          >
                                            Sửa
                                          </button>
                                        ) : null}
                                        <Link
                                          href={`/admin/clients/${debt.client_id}`}
                                          className="rounded-lg border border-white/20 px-3 py-2 font-bold text-white hover:border-yellow-400 hover:text-yellow-300"
                                        >
                                          Mở khách hàng
                                        </Link>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </SectionCard>
                  ) : (
                    <div className="space-y-4">
                      <SectionCard
                        eyebrow="PHẢI TRẢ / PHẢI CHI — FXA TRẢ CHO NGƯỜI KHÁC"
                        title="Thêm khoản doanh nghiệp phải chi"
                      >
                        <form onSubmit={addPayable} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Khoản này thuộc tháng nào?</span>
                            <input
                              type="month"
                              value={payableMonth}
                              onChange={(event) => setPayableMonth(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white disabled:opacity-50"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Loại khoản phải trả</span>
                            <select
                              value={payableType}
                              onChange={(event) => setPayableType(event.target.value as PayableType)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black disabled:opacity-50"
                            >
                              {PAYABLE_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 xl:col-span-2">
                            <span className="font-bold text-gray-300">Tính vào nhóm nào?</span>
                            <select
                              value={payableExpenseGroup}
                              onChange={(event) => setPayableExpenseGroup(event.target.value as ExpenseGroup)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black disabled:opacity-50"
                            >
                              {EXPENSE_GROUP_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 xl:col-span-2">
                            <span className="font-bold text-gray-300">Trả cho ai?</span>
                            <input
                              value={payableCounterparty}
                              onChange={(event) => setPayableCounterparty(event.target.value)}
                              placeholder="Tên nhân viên / chủ nhà / nhà cung cấp"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white disabled:opacity-50"
                            />
                          </label>
                          <label className="grid gap-1 xl:col-span-3">
                            <span className="font-bold text-gray-300">Nội dung</span>
                            <input
                              value={payableTitle}
                              onChange={(event) => setPayableTitle(event.target.value)}
                              placeholder="Ví dụ: Lương PT tháng 7/2026"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white disabled:opacity-50"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Số tiền phải trả</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={payableAmount}
                              onChange={(event) => setPayableAmount(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white disabled:opacity-50"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="font-bold text-gray-300">Hạn thanh toán</span>
                            <input
                              type="date"
                              value={payableDueDate}
                              onChange={(event) => setPayableDueDate(event.target.value)}
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white disabled:opacity-50"
                            />
                          </label>
                          <label className="grid gap-1 xl:col-span-4">
                            <span className="font-bold text-gray-300">Ghi chú</span>
                            <input
                              value={payableNotes}
                              onChange={(event) => setPayableNotes(event.target.value)}
                              placeholder="Có thể để trống"
                              disabled={!isAdmin}
                              className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white disabled:opacity-50"
                            />
                          </label>
                          <div className="flex items-end xl:col-span-2">
                            <button
                              disabled={!isAdmin || saving}
                              className="w-full rounded-xl bg-yellow-400 px-4 py-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-50"
                            >
                              {saving ? "Đang lưu..." : "Thêm khoản phải trả"}
                            </button>
                          </div>
                        </form>
                      </SectionCard>

                      <SectionCard
                        eyebrow="PHẢI TRẢ / PHẢI CHI — CHI PHÍ THEO THÁNG PHÁT SINH"
                        title={`Khoản phải trả được tính vào ${monthLabel(selectedMonth)}`}
                      >
                        <div className="mb-4 grid gap-3 sm:grid-cols-3">
                          <KpiCard label="Còn phải trả trong tháng" value={money(summary.selectedPayableBalance)} tone="yellow" />
                          <KpiCard label="Số khoản phải trả" value={String(selectedPayables.length)} tone="neutral" />
                          <KpiCard label="Tổng phải trả toàn hệ thống" value={money(summary.allPayableBalance)} tone="blue" />
                        </div>

                        {editingPayableId && payableEditDraft ? (
                          <div className="mb-5 rounded-3xl border border-yellow-400/35 bg-yellow-400/10 p-5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-black text-yellow-200">Sửa khoản PHẢI TRẢ / PHẢI CHI</p>
                                <p className="mt-1 text-sm text-yellow-100/75">
                                  Khi đổi tháng, toàn bộ chi phí của khoản này sẽ chuyển sang báo cáo lãi / lỗ của tháng mới.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={cancelPayableEdit}
                                className="rounded-xl border border-white/20 px-4 py-2 font-bold text-white hover:border-white/50"
                              >
                                Đóng
                              </button>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                              <label className="grid gap-1">
                                <span className="font-bold text-gray-300">Khoản này thuộc tháng nào?</span>
                                <input
                                  type="month"
                                  value={payableEditDraft.accountingMonth}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current ? { ...current, accountingMonth: event.target.value } : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                                />
                              </label>
                              <label className="grid gap-1">
                                <span className="font-bold text-gray-300">Loại khoản</span>
                                <select
                                  value={payableEditDraft.payableType}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current
                                        ? { ...current, payableType: event.target.value as PayableType }
                                        : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black"
                                >
                                  {PAYABLE_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1 xl:col-span-2">
                                <span className="font-bold text-gray-300">Nhóm chi phí</span>
                                <select
                                  value={payableEditDraft.expenseGroup}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current
                                        ? { ...current, expenseGroup: event.target.value as ExpenseGroup }
                                        : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-white px-3 py-3 text-black"
                                >
                                  {EXPENSE_GROUP_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1 xl:col-span-2">
                                <span className="font-bold text-gray-300">Trả cho ai?</span>
                                <input
                                  value={payableEditDraft.counterparty}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current ? { ...current, counterparty: event.target.value } : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                                />
                              </label>
                              <label className="grid gap-1 xl:col-span-3">
                                <span className="font-bold text-gray-300">Nội dung</span>
                                <input
                                  value={payableEditDraft.title}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current ? { ...current, title: event.target.value } : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                                />
                              </label>
                              <label className="grid gap-1">
                                <span className="font-bold text-gray-300">Số tiền phải trả</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={payableEditDraft.totalAmount}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current ? { ...current, totalAmount: event.target.value } : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                                />
                              </label>
                              <label className="grid gap-1">
                                <span className="font-bold text-gray-300">Hạn thanh toán</span>
                                <input
                                  type="date"
                                  value={payableEditDraft.dueDate}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current ? { ...current, dueDate: event.target.value } : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                                />
                              </label>
                              <label className="grid gap-1 xl:col-span-5">
                                <span className="font-bold text-gray-300">Ghi chú</span>
                                <input
                                  value={payableEditDraft.notes}
                                  onChange={(event) =>
                                    setPayableEditDraft((current) =>
                                      current ? { ...current, notes: event.target.value } : current,
                                    )
                                  }
                                  className="rounded-xl border border-yellow-500/30 bg-black/60 px-3 py-3 text-white"
                                />
                              </label>
                              <div className="flex items-end justify-end gap-2 xl:col-span-6">
                                <button
                                  type="button"
                                  onClick={cancelPayableEdit}
                                  className="rounded-xl border border-white/20 px-4 py-3 font-bold text-white"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="button"
                                  onClick={savePayableEdit}
                                  disabled={saving}
                                  className="rounded-xl bg-yellow-400 px-5 py-3 font-black text-black disabled:opacity-50"
                                >
                                  {saving ? "Đang lưu..." : "Lưu khoản phải trả"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedPayables.length === 0 ? (
                          <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                            Không có khoản PHẢI TRẢ / PHẢI CHI được tính vào tháng này.
                          </p>
                        ) : (
                          <div className="overflow-auto rounded-2xl border border-white/10">
                            <table className="w-full min-w-[1680px] border-collapse text-left text-sm">
                              <thead className="bg-yellow-400 text-black">
                                <tr>
                                  <th className="p-3">Loại công nợ</th>
                                  <th className="p-3">Người trả / nhận</th>
                                  <th className="p-3">Nội dung</th>
                                  <th className="p-3">Nhóm chi phí</th>
                                  <th className="p-3 text-right">Tổng phải trả</th>
                                  <th className="p-3 text-right">Đã trả</th>
                                  <th className="p-3 text-right">Còn phải trả</th>
                                  <th className="p-3">Hạn trả</th>
                                  <th className="p-3">Tính vào tháng</th>
                                  <th className="p-3">Thanh toán thực tế</th>
                                  <th className="p-3 text-right">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedPayables.map((payable, index) => {
                                  const remaining = Math.max(
                                    toNumber(payable.total_amount) - toNumber(payable.paid_amount),
                                    0,
                                  );
                                  const overdue =
                                    remaining > 0 &&
                                    Boolean(payable.due_date) &&
                                    String(payable.due_date) < todayInputDate();

                                  return (
                                    <tr
                                      key={payable.id}
                                      className={`border-b border-white/10 ${
                                        index % 2 === 0 ? "bg-black/45" : "bg-white/[0.035]"
                                      }`}
                                    >
                                      <td className="p-3">
                                        <span className="rounded-full border border-red-400/35 bg-red-400/10 px-3 py-1 font-black text-red-200">
                                          PHẢI TRẢ
                                        </span>
                                        <p className="mt-2 font-bold text-yellow-300">{getPayableTypeLabel(payable.payable_type)}</p>
                                      </td>
                                      <td className="p-3 font-bold text-white">{payable.counterparty}</td>
                                      <td className="p-3">
                                        <p className="font-bold text-white">{payable.title}</p>
                                        {payable.notes ? <p className="mt-1 max-w-sm text-xs text-gray-500">{payable.notes}</p> : null}
                                      </td>
                                      <td className="p-3 text-gray-300">{getReportGroupLabel(payable.expense_group)}</td>
                                      <td className="p-3 text-right text-white">{money(payable.total_amount)}</td>
                                      <td className="p-3 text-right text-green-300">{money(payable.paid_amount)}</td>
                                      <td className="p-3 text-right font-black text-yellow-300">{money(remaining)}</td>
                                      <td className={`p-3 ${overdue ? "font-bold text-red-300" : "text-gray-300"}`}>
                                        {formatDate(payable.due_date)}
                                        {overdue ? <p className="mt-1">Quá hạn</p> : null}
                                      </td>
                                      <td className="p-3">
                                        <p className="font-bold text-white">{monthLabel(normalizeMonthKey(payable.accounting_month))}</p>
                                        <p className="mt-1 text-xs text-gray-500">Chi phí được tính vào tháng này</p>
                                      </td>
                                      <td className="p-3">
                                        {remaining > 0 && payable.status !== "cancelled" ? (
                                          <div className="grid min-w-[340px] grid-cols-[1fr_1fr_auto] gap-2">
                                            <input
                                              type="number"
                                              min="0"
                                              max={remaining}
                                              step="0.01"
                                              value={paymentAmounts[payable.id] || ""}
                                              onChange={(event) =>
                                                setPaymentAmounts((current) => ({
                                                  ...current,
                                                  [payable.id]: event.target.value,
                                                }))
                                              }
                                              placeholder={remaining.toFixed(2)}
                                              disabled={!isAdmin}
                                              className="rounded-lg border border-yellow-500/25 bg-black/60 px-2 py-2 text-white disabled:opacity-50"
                                            />
                                            <input
                                              type="date"
                                              value={paymentDates[payable.id] || todayInputDate()}
                                              onChange={(event) =>
                                                setPaymentDates((current) => ({
                                                  ...current,
                                                  [payable.id]: event.target.value,
                                                }))
                                              }
                                              disabled={!isAdmin}
                                              className="rounded-lg border border-yellow-500/25 bg-black/60 px-2 py-2 text-white disabled:opacity-50"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => payPayable(payable)}
                                              disabled={!isAdmin || saving}
                                              className="rounded-lg bg-yellow-400 px-3 py-2 font-black text-black disabled:opacity-50"
                                            >
                                              Trả tiền
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="font-bold text-green-300">{getPayableStatusLabel(payable.status)}</span>
                                        )}
                                      </td>
                                      <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2">
                                          {isAdmin ? (
                                            <button
                                              type="button"
                                              onClick={() => startPayableEdit(payable)}
                                              className="rounded-lg border border-yellow-400 px-3 py-2 font-bold text-yellow-300 hover:bg-yellow-400 hover:text-black"
                                            >
                                              Sửa
                                            </button>
                                          ) : null}
                                          {isAdmin && toNumber(payable.paid_amount) === 0 ? (
                                            <button
                                              type="button"
                                              onClick={() => deletePayable(payable)}
                                              className="rounded-lg border border-red-400 px-3 py-2 font-bold text-red-300 hover:bg-red-400 hover:text-black"
                                            >
                                              Xóa
                                            </button>
                                          ) : (
                                            <span className="self-center text-xs text-gray-500">{getPayableStatusLabel(payable.status)}</span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </SectionCard>
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "ledger" ? (
                <div className="mt-4 space-y-4">
                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="Doanh thu thuần" value={money(currentProfitLoss.netRevenue)} tone="green" />
                    <KpiCard label="Giá vốn / trực tiếp" value={money(currentProfitLoss.costOfSales)} tone="red" />
                    <KpiCard
                      label="Chi phí vận hành"
                      value={money(
                        currentProfitLoss.sellingExpense +
                          currentProfitLoss.adminExpense +
                          currentProfitLoss.financialExpense,
                      )}
                      tone="red"
                    />
                    <KpiCard label="Lợi nhuận sau thuế" value={money(currentProfitLoss.netProfit)} tone={currentProfitLoss.netProfit >= 0 ? "yellow" : "red"} />
                  </section>

                  <SectionCard eyebrow="Tổng hợp kế toán" title={`Tổng hợp doanh thu và chi phí ${monthLabel(selectedMonth)}`}>
                    {ledgerGroups.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-black/40 p-5 text-sm text-gray-400">
                        Chưa có doanh thu hoặc chi phí được ghi nhận trong tháng này.
                      </p>
                    ) : (
                      <div className="overflow-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                          <thead className="bg-yellow-400 text-black">
                            <tr>
                              <th className="p-3">Nhóm kế toán</th>
                              <th className="p-3 text-right">Từ sổ nhật ký</th>
                              <th className="p-3 text-right">Từ công nợ phải trả</th>
                              <th className="p-3 text-right">Tổng ghi nhận</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledgerGroups.map((group, index) => (
                              <tr
                                key={group.key}
                                className={`border-b border-white/10 ${index % 2 === 0 ? "bg-black/45" : "bg-white/[0.035]"}`}
                              >
                                <td className="p-3 font-bold text-white">{group.label}</td>
                                <td className="p-3 text-right text-gray-300">{money(group.transactionTotal)}</td>
                                <td className="p-3 text-right text-gray-300">{money(group.payableTotal)}</td>
                                <td className="p-3 text-right font-black text-yellow-300">{money(group.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>

                  {currentProfitLoss.unclassifiedCount > 0 ? (
                    <div className="rounded-3xl border border-orange-500/35 bg-orange-500/10 p-5">
                      <p className="font-black text-orange-300">
                        Còn {currentProfitLoss.unclassifiedCount} giao dịch chưa phân loại chính thức.
                      </p>
                      <p className="mt-2 text-sm text-orange-100/80">
                        Hãy chọn lại nhóm trong Nhật ký thu chi trước khi xuất báo cáo.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-5 text-green-200">
                      Tất cả giao dịch trong tháng đã có phân loại chính thức.
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "profit_loss" ? (
                <div className="mt-4 space-y-4">
                  <details className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                    <summary className="cursor-pointer font-bold text-gray-200">Ước tính thuế (không bắt buộc)</summary>
                    <div className="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-400">Thuế suất (%)</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={taxRates[selectedMonth] || ""}
                          onChange={(event) => updateTaxRate(event.target.value)}
                          placeholder="Để trống"
                          disabled={!isAdmin}
                          className="rounded-xl border border-white/20 bg-black/60 px-4 py-3 text-white outline-none disabled:opacity-50"
                        />
                      </label>
                      <p className="text-sm text-gray-400">
                        {currentTaxRate === null
                          ? `Đang dùng số thuế đã ghi nhận: ${money(currentProfitLoss.recordedIncomeTaxCurrent)}`
                          : `Thuế ước tính: ${money(currentProfitLoss.incomeTaxCurrent)}`}
                      </p>
                    </div>
                  </details>

                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="Doanh thu thuần" value={money(currentProfitLoss.netRevenue)} tone="green" />
                    <KpiCard label="Lợi nhuận gộp" value={money(currentProfitLoss.grossProfit)} tone={currentProfitLoss.grossProfit >= 0 ? "yellow" : "red"} />
                    <KpiCard label="Lợi nhuận trước thuế" value={money(currentProfitLoss.profitBeforeTax)} tone={currentProfitLoss.profitBeforeTax >= 0 ? "yellow" : "red"} />
                    <KpiCard label="Lợi nhuận sau thuế" value={money(currentProfitLoss.netProfit)} tone={currentProfitLoss.netProfit >= 0 ? "green" : "red"} />
                  </section>

                  <SectionCard eyebrow="Báo cáo kết quả hoạt động kinh doanh" title={`${monthLabel(selectedMonth)} so với ${monthLabel(previousMonth)}`}>
                    <div className="overflow-auto rounded-2xl border border-white/10 bg-white">
                      <table className="w-full min-w-[900px] border-collapse text-left text-xs text-black">
                        <thead className="bg-gray-300">
                          <tr>
                            <th className="border border-gray-600 p-3 text-center">Chỉ tiêu</th>
                            <th className="border border-gray-600 p-3 text-center">Mã số</th>
                            <th className="border border-gray-600 p-3 text-center">Kỳ này</th>
                            <th className="border border-gray-600 p-3 text-center">Kỳ trước</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitLossRows.map((row) => (
                            <tr key={`${row.code}-${row.item}`} className={row.bold ? "font-black" : ""}>
                              <td className="border border-gray-500 p-2">{row.item}</td>
                              <td className="border border-gray-500 p-2 text-center">{row.code}</td>
                              <td className={`border border-gray-500 p-2 text-right ${row.current < 0 ? "text-red-700" : ""}`}>{money(row.current)}</td>
                              <td className={`border border-gray-500 p-2 text-right ${row.previous < 0 ? "text-red-700" : ""}`}>{money(row.previous)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={exportPrintableReport}
                        className="rounded-xl border border-yellow-400 px-4 py-3 text-xs font-bold uppercase text-yellow-300 hover:bg-yellow-400 hover:text-black"
                      >
                        Xuất bản in
                      </button>
                      <button
                        type="button"
                        onClick={exportAccountingWorkbook}
                        className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black uppercase text-black hover:bg-yellow-300"
                      >
                        Xuất Excel
                      </button>
                    </div>

                  </SectionCard>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
