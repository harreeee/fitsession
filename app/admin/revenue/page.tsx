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

type AdminRole = "admin" | "manager";
type TabKey =
  | "overview"
  | "journal"
  | "payables"
  | "accounts"
  | "categories"
  | "profit_loss";
type TransactionType = "income" | "expense" | "cash_adjustment";
type CategoryKind = "income" | "expense";
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
type PayableStatus = "unpaid" | "partial" | "paid" | "cancelled";
type PayableType =
  | "salary"
  | "commission"
  | "rent"
  | "utilities"
  | "internet"
  | "insurance"
  | "supplier"
  | "tax"
  | "loan"
  | "marketing"
  | "equipment"
  | "depreciation"
  | "other";
type AccountType = "cash" | "bank" | "credit_card" | "e_wallet" | "other";

type FinanceAccount = {
  id: string;
  name: string;
  account_type: AccountType;
  currency: string;
  opening_balance: number | string;
  allow_negative: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

type FinanceCategory = {
  id: string;
  name: string;
  category_kind: CategoryKind;
  system_key: string | null;
  parent_id: string | null;
  report_group: ReportGroup;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

type FinanceTransfer = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number | string;
  transfer_date: string;
  notes: string | null;
  created_at: string;
};

type BusinessTransaction = {
  id: string;
  transaction_type: TransactionType;
  source: string;
  title: string;
  amount: number | string;
  notes: string | null;
  transaction_date: string;
  accounting_month: string | null;
  report_group: ReportGroup | null;
  counterparty: string | null;
  document_no: string | null;
  payable_id: string | null;
  account_id: string | null;
  category_id: string | null;
  transfer_id: string | null;
  trainer_id: string | null;
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
  expense_group: ReportGroup;
  notes: string | null;
  status: PayableStatus;
  category_id: string | null;
  trainer_id: string | null;
  created_at: string;
  updated_at: string;
};

type PayableEditState = {
  id: string;
  categoryId: string;
  trainerId: string;
  counterparty: string;
  title: string;
  totalAmount: string;
  accountingMonth: string;
  dueDate: string;
  notes: string;
  editReason: string;
  paidAmount: number;
};

type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
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
  status: string | null;
  created_at: string;
  clients: ClientRelation | ClientRelation[] | null;
};

const TABS: Array<{ key: TabKey; title: string; detail: string }> = [
  { key: "overview", title: "Tổng quan", detail: "Dòng tiền, công nợ và lợi nhuận" },
  { key: "journal", title: "Thu / chi", detail: "Ghi nhận tiền vào và tiền ra" },
  { key: "payables", title: "Công nợ phải trả", detail: "Lương, thuê, thuế và nhà cung cấp" },
  { key: "accounts", title: "Nguồn tiền", detail: "Quỹ, ngân hàng, thẻ và chuyển khoản" },
  { key: "categories", title: "Danh mục", detail: "Danh mục hệ thống và chi phí custom" },
  { key: "profit_loss", title: "Lãi lỗ", detail: "Tổng hợp theo nhóm kế toán quản trị" },
];

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank", label: "Tài khoản ngân hàng" },
  { value: "credit_card", label: "Thẻ tín dụng" },
  { value: "e_wallet", label: "Ví điện tử" },
  { value: "other", label: "Nguồn khác" },
];


const REPORT_GROUP_LABELS: Record<ReportGroup, string> = {
  sales_revenue: "Doanh thu bán hàng / dịch vụ",
  revenue_deduction: "Giảm trừ doanh thu",
  cost_of_sales: "Giá vốn / chi phí trực tiếp",
  financial_income: "Doanh thu tài chính",
  financial_expense: "Chi phí tín dụng / tài chính",
  selling_expense: "Chi phí bán hàng / Marketing",
  admin_expense: "Chi phí quản lý",
  other_income: "Thu nhập khác",
  other_expense: "Chi phí khác",
  income_tax_current: "Thuế",
  income_tax_deferred: "Thuế hoãn lại",
  cash_only: "Dòng tiền / đầu tư, không vào lãi lỗ",
};

const CUSTOM_REPORT_GROUPS: Array<{ value: ReportGroup; label: string }> = [
  { value: "admin_expense", label: "Chi phí quản lý" },
  { value: "selling_expense", label: "Chi phí bán hàng / Marketing" },
  { value: "financial_expense", label: "Chi phí tín dụng / tài chính" },
  { value: "cost_of_sales", label: "Giá vốn / chi phí trực tiếp" },
  { value: "other_expense", label: "Chi phí khác" },
  { value: "income_tax_current", label: "Thuế" },
  { value: "cash_only", label: "Đầu tư / dòng tiền, không vào lãi lỗ" },
];

function currentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(monthKey: string) {
  return `${monthKey}-01`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });
}

function normalizeMonth(value: string | null | undefined) {
  return (value || currentMonthKey()).slice(0, 7);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("vi-VN");
}

function staffName(profile: StaffProfile | undefined) {
  return profile?.full_name || profile?.email || "Không rõ";
}

function getClient(value: ClientDebt["clients"]) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function categorySource(category: FinanceCategory | undefined) {
  return category?.system_key || "custom_expense";
}

function payableTypeFromCategory(category: FinanceCategory | undefined): PayableType {
  switch (category?.system_key) {
    case "salary":
      return "salary";
    case "rent":
      return "rent";
    case "utilities":
      return "utilities";
    case "internet":
      return "internet";
    case "insurance":
      return "insurance";
    case "tax":
      return "tax";
    case "credit_expense":
      return "loan";
    case "marketing":
      return "marketing";
    case "capital_investment":
      return "equipment";
    case "depreciation":
      return "depreciation";
    default:
      return "other";
  }
}

function inputClass() {
  return "w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-50";
}

function selectClass() {
  return "w-full rounded-xl border border-white/15 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-yellow-400 disabled:cursor-not-allowed disabled:opacity-50";
}

function Card({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-yellow-400">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white md:text-2xl">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "green" | "red" | "yellow" | "blue";
}) {
  const styles = {
    neutral: "border-white/10 bg-white/[0.04] text-white",
    green: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    red: "border-rose-400/20 bg-rose-400/[0.07] text-rose-300",
    yellow: "border-yellow-400/25 bg-yellow-400/[0.08] text-yellow-300",
    blue: "border-sky-400/20 bg-sky-400/[0.07] text-sky-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

export default function RevenuePage() {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [payables, setPayables] = useState<BusinessPayable[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [clientDebts, setClientDebts] = useState<ClientDebt[]>([]);

  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [transactionCategoryId, setTransactionCategoryId] = useState("");
  const [transactionTitle, setTransactionTitle] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayValue());
  const [transactionMonth, setTransactionMonth] = useState(currentMonthKey());
  const [transactionCounterparty, setTransactionCounterparty] = useState("");
  const [transactionDocument, setTransactionDocument] = useState("");
  const [transactionNotes, setTransactionNotes] = useState("");
  const [transactionTrainerId, setTransactionTrainerId] = useState("");

  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("bank");
  const [accountOpeningBalance, setAccountOpeningBalance] = useState("");
  const [accountAllowNegative, setAccountAllowNegative] = useState(false);
  const [accountNotes, setAccountNotes] = useState("");
  const [adjustAccountId, setAdjustAccountId] = useState("");
  const [adjustNewBalance, setAdjustNewBalance] = useState("");
  const [adjustDate, setAdjustDate] = useState(todayValue());
  const [adjustReason, setAdjustReason] = useState("");

  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(todayValue());
  const [transferNotes, setTransferNotes] = useState("");

  const [customCategoryName, setCustomCategoryName] = useState("");
  const [customCategoryGroup, setCustomCategoryGroup] = useState<ReportGroup>("other_expense");

  const [payableCategoryId, setPayableCategoryId] = useState("");
  const [payableTrainerId, setPayableTrainerId] = useState("");
  const [payableCounterparty, setPayableCounterparty] = useState("");
  const [payableTitle, setPayableTitle] = useState("");
  const [payableAmount, setPayableAmount] = useState("");
  const [payableMonth, setPayableMonth] = useState(currentMonthKey());
  const [payableDueDate, setPayableDueDate] = useState("");
  const [payableNotes, setPayableNotes] = useState("");
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentAccounts, setPaymentAccounts] = useState<Record<string, string>>({});
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [editingPayable, setEditingPayable] = useState<PayableEditState | null>(null);

  const isAdmin = role === "admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const [
      accountResult,
      categoryResult,
      transactionResult,
      payableResult,
      transferResult,
      staffResult,
      debtResult,
    ] = await Promise.all([
      supabase
        .from("finance_accounts")
        .select("id, name, account_type, currency, opening_balance, allow_negative, is_active, notes, created_at")
        .order("is_active", { ascending: false })
        .order("name"),
      supabase
        .from("finance_categories")
        .select("id, name, category_kind, system_key, parent_id, report_group, is_system, is_active, sort_order")
        .order("sort_order")
        .order("name"),
      supabase
        .from("business_transactions")
        .select("id, transaction_type, source, title, amount, notes, transaction_date, accounting_month, report_group, counterparty, document_no, payable_id, account_id, category_id, transfer_id, trainer_id, created_at")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("business_payables")
        .select("id, accounting_month, payable_type, counterparty, title, total_amount, paid_amount, due_date, expense_group, notes, status, category_id, trainer_id, created_at, updated_at")
        .order("accounting_month", { ascending: false })
        .order("due_date", { ascending: true }),
      supabase
        .from("finance_transfers")
        .select("id, from_account_id, to_account_id, amount, transfer_date, notes, created_at")
        .order("transfer_date", { ascending: false })
        .limit(100),
      supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["trainer", "nutrition_coach"])
        .order("full_name"),
      supabase
        .from("client_purchases")
        .select("id, client_id, plan_name, price, amount_paid, balance_due, debt_deadline, debt_month, status, created_at, clients(id, full_name, client_code)")
        .gt("balance_due", 0)
        .order("debt_deadline", { ascending: true, nullsFirst: false }),
    ]);

    const firstError = [
      accountResult.error,
      categoryResult.error,
      transactionResult.error,
      payableResult.error,
      transferResult.error,
      staffResult.error,
      debtResult.error,
    ].find(Boolean);

    if (firstError) {
      setMessage(
        `${firstError.message}. Hãy chạy migration 20260806_finance_accounts_categories_payroll.sql trước.`,
      );
      setLoading(false);
      return;
    }

    const nextAccounts = (accountResult.data || []) as FinanceAccount[];
    const nextCategories = (categoryResult.data || []) as FinanceCategory[];
    const nextPayables = (payableResult.data || []) as BusinessPayable[];

    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setTransactions((transactionResult.data || []) as BusinessTransaction[]);
    setPayables(nextPayables);
    setTransfers((transferResult.data || []) as FinanceTransfer[]);
    setStaff((staffResult.data || []) as StaffProfile[]);
    setClientDebts((debtResult.data || []) as ClientDebt[]);

    const firstActiveAccount = nextAccounts.find((row) => row.is_active)?.id || "";
    const firstIncomeCategory = nextCategories.find(
      (row) => row.is_active && row.category_kind === "income",
    )?.id || "";
    const firstExpenseCategory = nextCategories.find(
      (row) => row.is_active && row.category_kind === "expense",
    )?.id || "";

    setTransactionAccountId((current) => current || firstActiveAccount);
    setTransactionCategoryId((current) => current || firstIncomeCategory);
    setAdjustAccountId((current) => current || firstActiveAccount);
    setTransferFromId((current) => current || firstActiveAccount);
    setPaymentAccounts((current) => {
      const next = { ...current };
      for (const payable of nextPayables) {
        if (!next[payable.id]) next[payable.id] = firstActiveAccount;
      }
      return next;
    });
    setPaymentDates((current) => {
      const next = { ...current };
      for (const payable of nextPayables) {
        if (!next[payable.id]) next[payable.id] = todayValue();
      }
      return next;
    });
    setPayableCategoryId((current) => current || firstExpenseCategory);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function protect() {
      const { user, role: currentRole } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      if (currentRole === "admin" || currentRole === "manager") {
        setRole(currentRole);
        setCheckingRole(false);
        await fetchData();
        return;
      }
      if (currentRole === "trainer" || currentRole === "nutrition_coach") {
        router.push("/trainer/scan");
        return;
      }
      router.push("/client");
    }
    void protect();
  }, [fetchData, router]);

  const accountMap = useMemo(
    () => new Map(accounts.map((row) => [row.id, row])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((row) => [row.id, row])),
    [categories],
  );
  const staffMap = useMemo(
    () => new Map(staff.map((row) => [row.id, row])),
    [staff],
  );

  const activeAccounts = useMemo(
    () => accounts.filter((row) => row.is_active),
    [accounts],
  );
  const activeIncomeCategories = useMemo(
    () => categories.filter((row) => row.is_active && row.category_kind === "income"),
    [categories],
  );
  const activeExpenseCategories = useMemo(
    () => categories.filter((row) => row.is_active && row.category_kind === "expense"),
    [categories],
  );

  useEffect(() => {
    const list = transactionType === "income" ? activeIncomeCategories : activeExpenseCategories;
    if (!list.some((row) => row.id === transactionCategoryId)) {
      setTransactionCategoryId(list[0]?.id || "");
    }
  }, [activeExpenseCategories, activeIncomeCategories, transactionCategoryId, transactionType]);

  useEffect(() => {
    const category = categoryMap.get(payableCategoryId);
    if (category?.system_key === "salary") {
      const trainer = staffMap.get(payableTrainerId);
      if (trainer) {
        setPayableCounterparty(staffName(trainer));
        if (!payableTitle.trim()) {
          setPayableTitle(`Lương PT - ${staffName(trainer)} - ${payableMonth}`);
        }
      }
    }
  }, [categoryMap, payableCategoryId, payableMonth, payableTitle, payableTrainerId, staffMap]);

  const accountBalances = useMemo<Map<string, number>>(() => {
    const balances = new Map<string, number>();
    for (const account of accounts) {
      balances.set(account.id, numberValue(account.opening_balance));
    }
    for (const transaction of transactions) {
      if (!transaction.account_id) continue;
      const current = balances.get(transaction.account_id) || 0;
      const amount = numberValue(transaction.amount);
      if (transaction.transaction_type === "income") {
        balances.set(transaction.account_id, current + Math.abs(amount));
      } else if (transaction.transaction_type === "expense") {
        balances.set(transaction.account_id, current - Math.abs(amount));
      } else {
        balances.set(transaction.account_id, current + amount);
      }
    }
    return balances;
  }, [accounts, transactions]);

  const monthTransactions = useMemo(
    () =>
      transactions.filter(
        (row) => normalizeMonth(row.accounting_month || row.transaction_date) === selectedMonth,
      ),
    [selectedMonth, transactions],
  );

  const monthPayables = useMemo(
    () => payables.filter((row) => normalizeMonth(row.accounting_month) === selectedMonth),
    [payables, selectedMonth],
  );

  const monthClientDebts = useMemo(
    () => clientDebts.filter((row) => normalizeMonth(row.debt_month || row.created_at) === selectedMonth),
    [clientDebts, selectedMonth],
  );

  const summary = useMemo(() => {
    const cashRows = transactions.filter(
      (row) => normalizeMonth(row.transaction_date) === selectedMonth,
    );
    const income = cashRows
      .filter((row) => row.transaction_type === "income")
      .reduce((sum, row) => sum + Math.abs(numberValue(row.amount)), 0);
    const expense = cashRows
      .filter((row) => row.transaction_type === "expense")
      .reduce((sum, row) => sum + Math.abs(numberValue(row.amount)), 0);
    const adjustment = cashRows
      .filter((row) => row.transaction_type === "cash_adjustment")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);
    const totalAccountBalance = Array.from(accountBalances.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const receivable = clientDebts.reduce(
      (sum, row) => sum + numberValue(row.balance_due),
      0,
    );
    const payable = payables
      .filter((row) => row.status !== "cancelled")
      .reduce(
        (sum, row) =>
          sum + Math.max(numberValue(row.total_amount) - numberValue(row.paid_amount), 0),
        0,
      );

    return {
      income,
      expense,
      adjustment,
      netCash: income - expense + adjustment,
      totalAccountBalance,
      receivable,
      payable,
    };
  }, [accountBalances, clientDebts, payables, selectedMonth, transactions]);

  const categoryTotals = useMemo<Map<string, number>>(() => {
    const totals = new Map<string, number>();
    for (const transaction of monthTransactions) {
      if (transaction.payable_id && transaction.report_group === "cash_only") continue;
      const key = transaction.category_id || "unclassified";
      totals.set(key, (totals.get(key) || 0) + Math.abs(numberValue(transaction.amount)));
    }
    for (const payable of monthPayables) {
      if (payable.status === "cancelled") continue;
      const key = payable.category_id || "unclassified_payable";
      totals.set(key, (totals.get(key) || 0) + numberValue(payable.total_amount));
    }
    return totals;
  }, [monthPayables, monthTransactions]);

  const profitLoss = useMemo(() => {
    const groups = new Map<ReportGroup, number>();
    const add = (group: ReportGroup, value: number) => {
      groups.set(group, (groups.get(group) || 0) + value);
    };

    for (const transaction of monthTransactions) {
      if (transaction.payable_id && transaction.report_group === "cash_only") continue;
      const group = transaction.report_group || categoryMap.get(transaction.category_id || "")?.report_group;
      if (!group || group === "cash_only") continue;
      add(group, Math.abs(numberValue(transaction.amount)));
    }

    for (const payable of monthPayables) {
      if (payable.status === "cancelled" || payable.expense_group === "cash_only") continue;
      add(payable.expense_group, numberValue(payable.total_amount));
    }

    const revenue = (groups.get("sales_revenue") || 0) + (groups.get("financial_income") || 0) + (groups.get("other_income") || 0);
    const expenses =
      (groups.get("revenue_deduction") || 0) +
      (groups.get("cost_of_sales") || 0) +
      (groups.get("financial_expense") || 0) +
      (groups.get("selling_expense") || 0) +
      (groups.get("admin_expense") || 0) +
      (groups.get("other_expense") || 0) +
      (groups.get("income_tax_current") || 0) +
      (groups.get("income_tax_deferred") || 0);

    return { groups, revenue, expenses, net: revenue - expenses };
  }, [categoryMap, monthPayables, monthTransactions]);

  const selectedTransactionCategory = categoryMap.get(transactionCategoryId);
  const selectedPayableCategory = categoryMap.get(payableCategoryId);

  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const amount = Number(transactionAmount);
    if (!transactionAccountId || !transactionCategoryId) {
      setMessage("Hãy chọn nguồn tiền và danh mục.");
      return;
    }
    if (!transactionTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Nội dung và số tiền hợp lệ là bắt buộc.");
      return;
    }
    if (selectedTransactionCategory?.system_key === "salary" && !transactionTrainerId) {
      setMessage("Chi phí lương phải chọn chính xác PT / nhân sự.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("create_finance_transaction", {
      p_transaction_type: transactionType,
      p_account_id: transactionAccountId,
      p_category_id: transactionCategoryId,
      p_source: categorySource(selectedTransactionCategory),
      p_title: transactionTitle.trim(),
      p_amount: amount,
      p_transaction_date: transactionDate,
      p_accounting_month: monthStart(transactionMonth),
      p_counterparty: transactionCounterparty.trim() || null,
      p_document_no: transactionDocument.trim() || null,
      p_notes: transactionNotes.trim() || null,
      p_trainer_id: transactionTrainerId || null,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTransactionTitle("");
    setTransactionAmount("");
    setTransactionCounterparty("");
    setTransactionDocument("");
    setTransactionNotes("");
    setTransactionTrainerId("");
    setMessage("Đã ghi giao dịch và cập nhật số dư nguồn tiền.");
    await fetchData();
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const openingBalance = Number(accountOpeningBalance || 0);
    if (!accountName.trim() || !Number.isFinite(openingBalance)) {
      setMessage("Tên nguồn tiền và số dư đầu kỳ phải hợp lệ.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("finance_accounts").insert({
      name: accountName.trim(),
      account_type: accountType,
      currency: "CAD",
      opening_balance: openingBalance,
      allow_negative: accountAllowNegative,
      is_active: true,
      notes: accountNotes.trim() || null,
      created_by: userData.user?.id || null,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAccountName("");
    setAccountOpeningBalance("");
    setAccountAllowNegative(false);
    setAccountNotes("");
    setMessage("Đã thêm nguồn tiền mới.");
    await fetchData();
  }

  async function adjustBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const newBalance = Number(adjustNewBalance);
    if (!adjustAccountId || !Number.isFinite(newBalance) || !adjustReason.trim()) {
      setMessage("Chọn tài khoản, nhập số dư mới và lý do điều chỉnh.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("adjust_finance_account_balance", {
      p_account_id: adjustAccountId,
      p_new_balance: newBalance,
      p_adjustment_date: adjustDate,
      p_reason: adjustReason.trim(),
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAdjustNewBalance("");
    setAdjustReason("");
    setMessage("Đã tạo bút toán điều chỉnh số dư; lịch sử không bị xóa.");
    await fetchData();
  }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const amount = Number(transferAmount);
    if (!transferFromId || !transferToId || transferFromId === transferToId) {
      setMessage("Nguồn chuyển và tài khoản nhận phải khác nhau.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Số tiền chuyển phải lớn hơn 0.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("create_finance_transfer", {
      p_from_account_id: transferFromId,
      p_to_account_id: transferToId,
      p_amount: amount,
      p_transfer_date: transferDate,
      p_notes: transferNotes.trim() || null,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTransferAmount("");
    setTransferNotes("");
    setMessage("Đã chuyển tiền và ghi hai bút toán đối ứng.");
    await fetchData();
  }

  async function toggleAccount(account: FinanceAccount) {
    if (!isAdmin) return;
    const { error } = await supabase
      .from("finance_accounts")
      .update({ is_active: !account.is_active })
      .eq("id", account.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(account.is_active ? "Đã ngừng sử dụng nguồn tiền." : "Đã kích hoạt nguồn tiền.");
    await fetchData();
  }

  async function addCustomCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    if (!customCategoryName.trim()) {
      setMessage("Hãy nhập tên danh mục custom.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("finance_categories").insert({
      name: customCategoryName.trim(),
      category_kind: "expense",
      report_group: customCategoryGroup,
      is_system: false,
      is_active: true,
      sort_order: 500,
      created_by: userData.user?.id || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setCustomCategoryName("");
    setMessage("Đã thêm danh mục chi phí custom.");
    await fetchData();
  }

  async function renameCustomCategory(category: FinanceCategory) {
    if (!isAdmin || category.is_system) return;
    const name = window.prompt("Tên mới cho danh mục", category.name)?.trim();
    if (!name || name === category.name) return;
    const { error } = await supabase
      .from("finance_categories")
      .update({ name })
      .eq("id", category.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Đã đổi tên danh mục custom.");
    await fetchData();
  }

  async function toggleCustomCategory(category: FinanceCategory) {
    if (!isAdmin || category.is_system) return;
    const { error } = await supabase
      .from("finance_categories")
      .update({ is_active: !category.is_active })
      .eq("id", category.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await fetchData();
  }

  async function addPayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const amount = Number(payableAmount);
    const category = categoryMap.get(payableCategoryId);
    const isSalary = category?.system_key === "salary";
    const trainer = staffMap.get(payableTrainerId);

    if (!category || !payableTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Danh mục, tiêu đề và số tiền công nợ là bắt buộc.");
      return;
    }
    if (isSalary && !trainer) {
      setMessage("Công nợ lương phải chọn chính xác PT / nhân sự.");
      return;
    }
    if (!isSalary && !payableCounterparty.trim()) {
      setMessage("Hãy nhập đối tượng phải trả.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("business_payables").insert({
      accounting_month: monthStart(payableMonth),
      payable_type: payableTypeFromCategory(category),
      counterparty: isSalary ? staffName(trainer) : payableCounterparty.trim(),
      title: payableTitle.trim(),
      total_amount: amount,
      paid_amount: 0,
      due_date: payableDueDate || null,
      expense_group: category.report_group,
      notes: payableNotes.trim() || null,
      status: "unpaid",
      category_id: category.id,
      trainer_id: isSalary ? trainer?.id : null,
      created_by: userData.user?.id || null,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPayableCounterparty("");
    setPayableTitle("");
    setPayableAmount("");
    setPayableDueDate("");
    setPayableNotes("");
    setPayableTrainerId("");
    setMessage("Đã ghi nhận công nợ phải trả.");
    await fetchData();
  }

  function openPayableEditor(payable: BusinessPayable) {
    if (!isAdmin) return;

    setEditingPayable({
      id: payable.id,
      categoryId: payable.category_id || "",
      trainerId: payable.trainer_id || "",
      counterparty: payable.counterparty,
      title: payable.title,
      totalAmount: String(payable.total_amount),
      accountingMonth: normalizeMonth(payable.accounting_month),
      dueDate: payable.due_date?.slice(0, 10) || "",
      notes: payable.notes || "",
      editReason: "",
      paidAmount: numberValue(payable.paid_amount),
    });
  }

  async function savePayableEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editingPayable) return;

    const category = categoryMap.get(editingPayable.categoryId);
    const amount = Number(editingPayable.totalAmount);
    const isSalary = category?.system_key === "salary";
    const trainer = staffMap.get(editingPayable.trainerId);

    if (!category || category.category_kind !== "expense") {
      setMessage("Hãy chọn một danh mục chi phí hợp lệ.");
      return;
    }
    if (!editingPayable.title.trim()) {
      setMessage("Tiêu đề công nợ là bắt buộc.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Tổng công nợ phải lớn hơn 0.");
      return;
    }
    if (amount < editingPayable.paidAmount) {
      setMessage(
        `Tổng công nợ không được thấp hơn số đã trả ${money(editingPayable.paidAmount)}.`,
      );
      return;
    }
    if (isSalary && !trainer) {
      setMessage("Công nợ lương phải chọn chính xác PT / nhân sự.");
      return;
    }
    if (!isSalary && !editingPayable.counterparty.trim()) {
      setMessage("Hãy nhập đối tượng phải trả.");
      return;
    }
    if (!editingPayable.editReason.trim()) {
      setMessage("Hãy nhập lý do chỉnh sửa để lưu lịch sử kế toán.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("update_business_payable_v2", {
      p_payable_id: editingPayable.id,
      p_category_id: editingPayable.categoryId,
      p_trainer_id: isSalary ? editingPayable.trainerId : null,
      p_counterparty: isSalary
        ? staffName(trainer)
        : editingPayable.counterparty.trim(),
      p_title: editingPayable.title.trim(),
      p_total_amount: amount,
      p_accounting_month: monthStart(editingPayable.accountingMonth),
      p_due_date: editingPayable.dueDate || null,
      p_notes: editingPayable.notes.trim() || null,
      p_edit_reason: editingPayable.editReason.trim(),
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingPayable(null);
    setMessage("Đã chỉnh sửa công nợ và lưu lịch sử thay đổi.");
    await fetchData();
  }

  async function payPayable(payable: BusinessPayable) {
    if (!isAdmin) return;
    const amount = Number(paymentAmounts[payable.id] || 0);
    const accountId = paymentAccounts[payable.id];
    const date = paymentDates[payable.id] || todayValue();
    const remaining = Math.max(
      numberValue(payable.total_amount) - numberValue(payable.paid_amount),
      0,
    );

    if (!accountId || !Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setMessage("Chọn nguồn thanh toán và nhập số tiền không vượt quá số còn phải trả.");
      return;
    }
    if (payable.payable_type === "salary" && !payable.trainer_id) {
      setMessage("Khoản lương này chưa gắn PT. Hãy sửa dữ liệu trước khi thanh toán.");
      return;
    }

    const confirmed = window.confirm(
      `Thanh toán ${money(amount)} cho ${payable.counterparty} từ ${accountMap.get(accountId)?.name || "tài khoản"}?`,
    );
    if (!confirmed) return;

    setSaving(true);
    const { error } = await supabase.rpc("pay_business_payable_v2", {
      p_payable_id: payable.id,
      p_amount: amount,
      p_payment_date: date,
      p_account_id: accountId,
      p_notes: null,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPaymentAmounts((current) => ({ ...current, [payable.id]: "" }));
    setMessage("Đã thanh toán công nợ và trừ đúng nguồn tiền.");
    await fetchData();
  }
  async function deletePayable(payable: BusinessPayable) {
  if (!isAdmin || saving) return;

  const paidAmount = numberValue(payable.paid_amount);

  if (paidAmount > 0) {
    setMessage(
      "Không thể xóa công nợ đã thanh toán một phần hoặc toàn bộ. Hãy giữ lại để bảo toàn lịch sử kế toán.",
    );
    return;
  }

  const confirmed = window.confirm(
    `Xóa công nợ “${payable.title}” của ${payable.counterparty}?\n\nHành động này không thể hoàn tác.`,
  );

  if (!confirmed) return;

  setSaving(true);
  setMessage("");

  // Kiểm tra lần cuối để tránh xóa khoản đã có giao dịch thanh toán.
  const {
    count: linkedTransactionCount,
    error: linkedTransactionError,
  } = await supabase
    .from("business_transactions")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("payable_id", payable.id);

  if (linkedTransactionError) {
    setSaving(false);
    setMessage(linkedTransactionError.message);
    return;
  }

  if ((linkedTransactionCount || 0) > 0) {
    setSaving(false);
    setMessage(
      "Không thể xóa vì công nợ này đã liên kết với giao dịch thanh toán.",
    );
    return;
  }

  const { error } = await supabase
    .from("business_payables")
    .delete()
    .eq("id", payable.id)
    .eq("paid_amount", 0);

  setSaving(false);

  if (error) {
    setMessage(error.message);
    return;
  }

  if (editingPayable?.id === payable.id) {
    setEditingPayable(null);
  }

  setMessage(`Đã xóa công nợ “${payable.title}”.`);
  await fetchData();
}
  async function deleteTransaction(transaction: BusinessTransaction) {
    if (!isAdmin) return;
    if (transaction.payable_id || transaction.transfer_id) {
      setMessage("Không thể xóa trực tiếp giao dịch công nợ hoặc chuyển khoản.");
      return;
    }
    if (!window.confirm(`Xóa giao dịch “${transaction.title}”?`)) return;
    const { error } = await supabase.from("business_transactions").delete().eq("id", transaction.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Đã xóa giao dịch. Số dư được tính lại từ sổ nhật ký.");
    await fetchData();
  }

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Đang kiểm tra quyền kế toán...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070707] p-3 text-white md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-3xl border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.15),_transparent_38%),#0b0b0b] p-5 md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-yellow-400">
                FXA FITNESS · KẾ TOÁN QUẢN TRỊ
              </p>
              <h1 className="mt-2 text-3xl font-semibold md:text-5xl">
                Doanh thu, Chi phí & Công nợ
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">
                Quản lý doanh thu bán hàng/dịch vụ, chi phí theo danh mục, nguồn thanh toán,
                chuyển tiền nội bộ, công nợ phải thu/phải trả và lương PT theo tháng.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Link href="/admin" className="rounded-xl border border-white/15 px-4 py-3 text-center text-xs font-semibold uppercase text-zinc-300 hover:border-yellow-400 hover:text-yellow-300">
                Dashboard
              </Link>
              <Link href="/admin/revenue/payroll" className="rounded-xl border border-yellow-400/35 px-4 py-3 text-center text-xs font-semibold uppercase text-yellow-300 hover:bg-yellow-400 hover:text-black">
                Báo lương PT
              </Link>
              <button type="button" onClick={() => void fetchData()} className="rounded-xl border border-white/15 px-4 py-3 text-xs font-semibold uppercase text-zinc-300 hover:border-yellow-400 hover:text-yellow-300">
                Làm mới
              </button>
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="rounded-xl border border-yellow-400/30 bg-black px-4 py-3 text-sm text-yellow-300" />
            </div>
          </div>

          {role === "manager" ? (
            <div className="mt-5 rounded-2xl border border-sky-400/20 bg-sky-400/[0.08] p-3 text-sm text-sky-200">
              Manager đang ở chế độ chỉ xem. Chỉ Admin được thêm, sửa số dư, chuyển tiền và thanh toán công nợ.
            </div>
          ) : null}
        </header>

        {message ? (
          <div className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.08] p-4 text-sm text-yellow-100">
            {message}
          </div>
        ) : null}

        <nav className="mt-4 grid gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-2 sm:grid-cols-2 xl:grid-cols-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-2xl px-4 py-3 text-left transition ${
                activeTab === tab.key
                  ? "bg-yellow-400 text-black"
                  : "bg-black/40 text-white hover:bg-white/[0.07]"
              }`}
            >
              <p className="text-sm font-semibold">{tab.title}</p>
              <p className={`mt-1 text-[11px] leading-4 ${activeTab === tab.key ? "text-black/65" : "text-zinc-500"}`}>
                {tab.detail}
              </p>
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-16 text-center text-yellow-400">
            Đang tải dữ liệu tài chính...
          </div>
        ) : (
          <>
            {activeTab === "overview" ? (
              <div className="mt-4 space-y-4">
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Kpi label="Thực thu trong tháng" value={money(summary.income)} detail="Tiền thực tế đi vào các nguồn tiền" tone="green" />
                  <Kpi label="Thực chi trong tháng" value={money(summary.expense)} detail="Tiền thực tế đã chi từ các nguồn" tone="red" />
                  <Kpi label="Dòng tiền ròng" value={money(summary.netCash)} detail={`Bao gồm điều chỉnh ${money(summary.adjustment)}`} tone={summary.netCash >= 0 ? "yellow" : "red"} />
                  <Kpi label="Tổng số dư nguồn tiền" value={money(summary.totalAccountBalance)} detail={`${accounts.length} nguồn tiền trong hệ thống`} tone="blue" />
                </section>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Kpi label="Doanh thu hạch toán" value={money(profitLoss.revenue)} detail={monthLabel(selectedMonth)} tone="green" />
                  <Kpi label="Chi phí hạch toán" value={money(profitLoss.expenses)} detail="Bao gồm công nợ phát sinh trong tháng" tone="red" />
                  <Kpi label="Lợi nhuận quản trị" value={money(profitLoss.net)} detail="Không tính mua máy móc trực tiếp vào chi phí" tone={profitLoss.net >= 0 ? "yellow" : "red"} />
                  <Kpi label="Công nợ còn lại" value={money(summary.receivable - summary.payable)} detail={`Phải thu ${money(summary.receivable)} · Phải trả ${money(summary.payable)}`} tone="neutral" />
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card eyebrow="Nguồn tiền" title="Số dư hiện tại">
                    <div className="space-y-3">
                      {accounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-4">
                          <div>
                            <p className="font-semibold text-white">{account.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{ACCOUNT_TYPES.find((item) => item.value === account.account_type)?.label || account.account_type}{account.is_active ? "" : " · Đã ngừng"}</p>
                          </div>
                          <p className={`text-lg font-semibold tabular-nums ${(accountBalances.get(account.id) || 0) < 0 ? "text-rose-300" : "text-yellow-300"}`}>
                            {money(accountBalances.get(account.id) || 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card eyebrow="Công nợ" title="Phải thu và phải trả">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Kpi label={`Phải thu ${monthLabel(selectedMonth)}`} value={money(monthClientDebts.reduce((sum, row) => sum + numberValue(row.balance_due), 0))} detail={`${monthClientDebts.length} khoản khách hàng còn nợ`} tone="yellow" />
                      <Kpi label={`Phải trả ${monthLabel(selectedMonth)}`} value={money(monthPayables.reduce((sum, row) => sum + Math.max(numberValue(row.total_amount) - numberValue(row.paid_amount), 0), 0))} detail={`${monthPayables.length} khoản phải trả`} tone="red" />
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-400">
                      Lương được gắn trực tiếp với PT. Khi thanh toán, Admin phải chọn nguồn tiền cụ thể; giao dịch sẽ trừ đúng tài khoản và cập nhật công nợ.
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}

            {activeTab === "journal" ? (
              <div className="mt-4 space-y-4">
                <Card eyebrow="Thêm giao dịch" title="Doanh thu bán hàng / dịch vụ hoặc chi phí">
                  <form onSubmit={addTransaction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Loại giao dịch</span>
                      <select value={transactionType} onChange={(event) => setTransactionType(event.target.value as "income" | "expense")} disabled={!isAdmin} className={selectClass()}>
                        <option value="income">Doanh thu / Thu tiền</option>
                        <option value="expense">Chi phí / Chi tiền</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Nguồn nhận / nguồn thanh toán</span>
                      <select value={transactionAccountId} onChange={(event) => setTransactionAccountId(event.target.value)} disabled={!isAdmin} className={selectClass()} required>
                        <option value="">Chọn nguồn tiền</option>
                        {activeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>{account.name} · {money(accountBalances.get(account.id) || 0)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Danh mục</span>
                      <select value={transactionCategoryId} onChange={(event) => setTransactionCategoryId(event.target.value)} disabled={!isAdmin} className={selectClass()} required>
                        {(transactionType === "income" ? activeIncomeCategories : activeExpenseCategories).map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Số tiền CAD</span>
                      <input type="number" min="0.01" step="0.01" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} disabled={!isAdmin} className={inputClass()} required />
                    </label>
                    <label className="grid gap-1 md:col-span-2">
                      <span className="text-xs text-zinc-400">Tiêu đề giao dịch</span>
                      <input value={transactionTitle} onChange={(event) => setTransactionTitle(event.target.value)} placeholder="Ví dụ: Thu tiền gói 24 buổi - Nguyễn Văn A" disabled={!isAdmin} className={inputClass()} required />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Ngày thực thu / chi</span>
                      <input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} disabled={!isAdmin} className={inputClass()} />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Tháng hạch toán</span>
                      <input type="month" value={transactionMonth} onChange={(event) => setTransactionMonth(event.target.value)} disabled={!isAdmin} className={inputClass()} />
                    </label>
                    {selectedTransactionCategory?.system_key === "salary" ? (
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-yellow-300">PT / nhân sự nhận lương *</span>
                        <select value={transactionTrainerId} onChange={(event) => setTransactionTrainerId(event.target.value)} disabled={!isAdmin} className={selectClass()} required>
                          <option value="">Chọn PT</option>
                          {staff.map((person) => <option key={person.id} value={person.id}>{staffName(person)}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Đối tượng</span>
                      <input value={transactionCounterparty} onChange={(event) => setTransactionCounterparty(event.target.value)} placeholder="Khách hàng / nhà cung cấp" disabled={!isAdmin} className={inputClass()} />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Số chứng từ</span>
                      <input value={transactionDocument} onChange={(event) => setTransactionDocument(event.target.value)} disabled={!isAdmin} className={inputClass()} />
                    </label>
                    <label className="grid gap-1 md:col-span-2 xl:col-span-3">
                      <span className="text-xs text-zinc-400">Ghi chú</span>
                      <textarea value={transactionNotes} onChange={(event) => setTransactionNotes(event.target.value)} disabled={!isAdmin} className={`${inputClass()} min-h-24`} />
                    </label>
                    <button disabled={!isAdmin || saving} className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">
                      {saving ? "Đang lưu..." : "Thêm giao dịch"}
                    </button>
                  </form>
                </Card>

                <Card eyebrow="Sổ nhật ký" title={`Giao dịch ${monthLabel(selectedMonth)}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px] text-left text-sm">
                      <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Ngày</th><th className="px-3 py-3">Loại</th><th className="px-3 py-3">Nội dung</th><th className="px-3 py-3">Danh mục</th><th className="px-3 py-3">Nguồn tiền</th><th className="px-3 py-3">PT</th><th className="px-3 py-3 text-right">Số tiền</th>{isAdmin ? <th className="px-3 py-3">Thao tác</th> : null}</tr></thead>
                      <tbody>
                        {monthTransactions.map((row) => (
                          <tr key={row.id} className="border-b border-white/10">
                            <td className="px-3 py-3">{formatDate(row.transaction_date)}</td>
                            <td className="px-3 py-3 uppercase">{row.transaction_type === "income" ? "Thu" : row.transaction_type === "expense" ? "Chi" : "Điều chỉnh"}</td>
                            <td className="max-w-[320px] px-3 py-3"><p className="font-medium">{row.title}</p><p className="mt-1 text-xs text-zinc-500">{row.counterparty || "-"}</p></td>
                            <td className="px-3 py-3">{categoryMap.get(row.category_id || "")?.name || REPORT_GROUP_LABELS[row.report_group || "cash_only"]}</td>
                            <td className="px-3 py-3">{accountMap.get(row.account_id || "")?.name || "Chưa phân bổ"}</td>
                            <td className="px-3 py-3">{row.trainer_id ? staffName(staffMap.get(row.trainer_id)) : "-"}</td>
                            <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.transaction_type === "income" || (row.transaction_type === "cash_adjustment" && numberValue(row.amount) > 0) ? "text-emerald-300" : "text-rose-300"}`}>{row.transaction_type === "expense" ? "-" : ""}{money(row.amount)}</td>
                            {isAdmin ? <td className="px-3 py-3"><button type="button" onClick={() => void deleteTransaction(row)} disabled={Boolean(row.payable_id || row.transfer_id)} className="text-xs text-rose-300 disabled:text-zinc-700">Xóa</button></td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {monthTransactions.length === 0 ? <p className="py-10 text-center text-zinc-500">Chưa có giao dịch trong tháng.</p> : null}
                  </div>
                </Card>
              </div>
            ) : null}

            {activeTab === "payables" ? (
              <div className="mt-4 space-y-4">
                <Card eyebrow="Tạo công nợ" title="Lương, chi phí quản lý, thuế, Marketing và nhà cung cấp" action={<Link href="/admin/revenue/payroll" className="rounded-xl border border-yellow-400/30 px-4 py-2 text-sm text-yellow-300">Mở báo lương PT</Link>}>
                  <form onSubmit={addPayable} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-1"><span className="text-xs text-zinc-400">Danh mục chi phí</span><select value={payableCategoryId} onChange={(event) => setPayableCategoryId(event.target.value)} disabled={!isAdmin} className={selectClass()}>{activeExpenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                    {selectedPayableCategory?.system_key === "salary" ? (
                      <label className="grid gap-1"><span className="text-xs font-semibold text-yellow-300">PT / nhân sự *</span><select value={payableTrainerId} onChange={(event) => setPayableTrainerId(event.target.value)} disabled={!isAdmin} className={selectClass()} required><option value="">Chọn PT</option>{staff.map((person) => <option key={person.id} value={person.id}>{staffName(person)}</option>)}</select></label>
                    ) : (
                      <label className="grid gap-1"><span className="text-xs text-zinc-400">Đối tượng phải trả</span><input value={payableCounterparty} onChange={(event) => setPayableCounterparty(event.target.value)} disabled={!isAdmin} className={inputClass()} required /></label>
                    )}
                    <label className="grid gap-1 md:col-span-2"><span className="text-xs text-zinc-400">Tiêu đề công nợ</span><input value={payableTitle} onChange={(event) => setPayableTitle(event.target.value)} placeholder="Ví dụ: Lương PT tháng 08/2026" disabled={!isAdmin} className={inputClass()} required /></label>
                    <label className="grid gap-1"><span className="text-xs text-zinc-400">Tổng phải trả CAD</span><input type="number" min="0.01" step="0.01" value={payableAmount} onChange={(event) => setPayableAmount(event.target.value)} disabled={!isAdmin} className={inputClass()} required /></label>
                    <label className="grid gap-1"><span className="text-xs text-zinc-400">Tháng hạch toán</span><input type="month" value={payableMonth} onChange={(event) => setPayableMonth(event.target.value)} disabled={!isAdmin} className={inputClass()} /></label>
                    <label className="grid gap-1"><span className="text-xs text-zinc-400">Hạn thanh toán</span><input type="date" value={payableDueDate} onChange={(event) => setPayableDueDate(event.target.value)} disabled={!isAdmin} className={inputClass()} /></label>
                    <label className="grid gap-1 md:col-span-2"><span className="text-xs text-zinc-400">Ghi chú</span><textarea value={payableNotes} onChange={(event) => setPayableNotes(event.target.value)} disabled={!isAdmin} className={`${inputClass()} min-h-20`} /></label>
                    <button disabled={!isAdmin || saving} className="rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black disabled:opacity-50">Thêm công nợ</button>
                  </form>
                </Card>

                <Card eyebrow="Danh sách công nợ" title={monthLabel(selectedMonth)}>
                  <div className="space-y-3">
                    {monthPayables.map((row) => {
                      const remaining = Math.max(numberValue(row.total_amount) - numberValue(row.paid_amount), 0);
                      return (
                        <div key={row.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-[10px] uppercase text-yellow-300">{row.status}</span><span className="text-xs text-zinc-500">Hạn {formatDate(row.due_date)}</span></div>
                              <h3 className="mt-2 font-semibold text-white">{row.title}</h3>
                              <p className="mt-1 text-sm text-zinc-400">{row.counterparty} · {categoryMap.get(row.category_id || "")?.name || REPORT_GROUP_LABELS[row.expense_group]}</p>
                              {row.trainer_id ? <p className="mt-1 text-sm text-yellow-200">PT: {staffName(staffMap.get(row.trainer_id))}</p> : null}
                              {row.notes ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-zinc-500">{row.notes}</p> : null}
                              <p className="mt-2 text-xs text-zinc-600">Cập nhật {formatDate(row.updated_at)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                              <div className="grid grid-cols-3 gap-3 text-right text-sm"><div><p className="text-zinc-500">Tổng</p><p className="font-semibold">{money(row.total_amount)}</p></div><div><p className="text-zinc-500">Đã trả</p><p className="font-semibold text-emerald-300">{money(row.paid_amount)}</p></div><div><p className="text-zinc-500">Còn lại</p><p className="font-semibold text-rose-300">{money(remaining)}</p></div></div>
                              {isAdmin ? (
  <div className="flex flex-wrap justify-end gap-2">
    <button
      type="button"
      onClick={() => openPayableEditor(row)}
      disabled={saving}
      className="rounded-xl border border-yellow-400/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-yellow-300 transition hover:bg-yellow-400/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Chỉnh sửa
    </button>

    <button
      type="button"
      onClick={() => void deletePayable(row)}
      disabled={saving || numberValue(row.paid_amount) > 0}
      title={
        numberValue(row.paid_amount) > 0
          ? "Không thể xóa công nợ đã có thanh toán"
          : "Xóa công nợ"
      }
      className="rounded-xl border border-rose-400/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-700"
    >
      Xóa
    </button>
  </div>
) : null}
                            </div>
                          </div>
                          {isAdmin && remaining > 0 ? (
                            <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:grid-cols-4">
                              <input type="number" min="0.01" step="0.01" max={remaining} value={paymentAmounts[row.id] || ""} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [row.id]: event.target.value }))} placeholder={`Tối đa ${remaining}`} className={inputClass()} />
                              <select value={paymentAccounts[row.id] || ""} onChange={(event) => setPaymentAccounts((current) => ({ ...current, [row.id]: event.target.value }))} className={selectClass()}><option value="">Nguồn thanh toán</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {money(accountBalances.get(account.id) || 0)}</option>)}</select>
                              <input type="date" value={paymentDates[row.id] || todayValue()} onChange={(event) => setPaymentDates((current) => ({ ...current, [row.id]: event.target.value }))} className={inputClass()} />
                              <button type="button" onClick={() => void payPayable(row)} disabled={saving} className="rounded-xl bg-yellow-400 px-4 py-2 font-semibold text-black disabled:opacity-50">Thanh toán</button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {monthPayables.length === 0 ? <p className="py-8 text-center text-zinc-500">Chưa có công nợ phải trả trong tháng.</p> : null}
                  </div>
                </Card>

                <Card eyebrow="Công nợ khách hàng" title="Các khoản phải thu đang mở">
                  <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Khách hàng</th><th className="px-3 py-3">Nội dung</th><th className="px-3 py-3">Đã thu</th><th className="px-3 py-3">Còn nợ</th><th className="px-3 py-3">Hạn</th></tr></thead><tbody>{clientDebts.map((row) => { const client = getClient(row.clients); return <tr key={row.id} className="border-b border-white/10"><td className="px-3 py-3">{client?.full_name || "Không rõ"}<p className="text-xs text-zinc-500">{client?.client_code || "-"}</p></td><td className="px-3 py-3">{row.plan_name || "Công nợ khách hàng"}</td><td className="px-3 py-3 text-emerald-300">{money(row.amount_paid)}</td><td className="px-3 py-3 text-rose-300">{money(row.balance_due)}</td><td className="px-3 py-3">{formatDate(row.debt_deadline)}</td></tr>; })}</tbody></table></div>
                </Card>
              </div>
            ) : null}

            {activeTab === "accounts" ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card eyebrow="Nguồn tiền" title="Thêm tài khoản / quỹ">
                    <form onSubmit={addAccount} className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 sm:col-span-2"><span className="text-xs text-zinc-400">Tên nguồn tiền</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Ví dụ: TD Business Chequing" disabled={!isAdmin} className={inputClass()} required /></label>
                      <label className="grid gap-1"><span className="text-xs text-zinc-400">Loại</span><select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)} disabled={!isAdmin} className={selectClass()}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                      <label className="grid gap-1"><span className="text-xs text-zinc-400">Số dư đầu kỳ</span><input type="number" step="0.01" value={accountOpeningBalance} onChange={(event) => setAccountOpeningBalance(event.target.value)} disabled={!isAdmin} className={inputClass()} /></label>
                      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 sm:col-span-2"><input type="checkbox" checked={accountAllowNegative} onChange={(event) => setAccountAllowNegative(event.target.checked)} disabled={!isAdmin} /><span className="text-sm text-zinc-300">Cho phép số dư âm, phù hợp thẻ tín dụng / hạn mức</span></label>
                      <textarea value={accountNotes} onChange={(event) => setAccountNotes(event.target.value)} placeholder="Ghi chú" disabled={!isAdmin} className={`${inputClass()} min-h-20 sm:col-span-2`} />
                      <button disabled={!isAdmin || saving} className="rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black sm:col-span-2 disabled:opacity-50">Thêm nguồn tiền</button>
                    </form>
                  </Card>

                  <Card eyebrow="Điều chỉnh" title="Đặt lại số dư có lịch sử">
                    <form onSubmit={adjustBalance} className="grid gap-3 sm:grid-cols-2">
                      <select value={adjustAccountId} onChange={(event) => setAdjustAccountId(event.target.value)} disabled={!isAdmin} className={selectClass()}><option value="">Chọn nguồn tiền</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · hiện tại {money(accountBalances.get(account.id) || 0)}</option>)}</select>
                      <input type="number" step="0.01" value={adjustNewBalance} onChange={(event) => setAdjustNewBalance(event.target.value)} placeholder="Số dư mới" disabled={!isAdmin} className={inputClass()} />
                      <input type="date" value={adjustDate} onChange={(event) => setAdjustDate(event.target.value)} disabled={!isAdmin} className={inputClass()} />
                      <input value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Lý do điều chỉnh bắt buộc" disabled={!isAdmin} className={inputClass()} />
                      <button disabled={!isAdmin || saving} className="rounded-xl border border-yellow-400 px-4 py-3 font-semibold text-yellow-300 sm:col-span-2 disabled:opacity-50">Ghi bút toán điều chỉnh</button>
                    </form>
                  </Card>
                </div>

                <Card eyebrow="Chuyển khoản nội bộ" title="Chuyển tiền giữa hai nguồn">
                  <form onSubmit={createTransfer} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <select value={transferFromId} onChange={(event) => setTransferFromId(event.target.value)} disabled={!isAdmin} className={selectClass()}><option value="">Từ nguồn</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {money(accountBalances.get(account.id) || 0)}</option>)}</select>
                    <select value={transferToId} onChange={(event) => setTransferToId(event.target.value)} disabled={!isAdmin} className={selectClass()}><option value="">Đến nguồn</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
                    <input type="number" min="0.01" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} placeholder="Số tiền CAD" disabled={!isAdmin} className={inputClass()} />
                    <input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} disabled={!isAdmin} className={inputClass()} />
                    <button disabled={!isAdmin || saving} className="rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black disabled:opacity-50">Chuyển tiền</button>
                    <input value={transferNotes} onChange={(event) => setTransferNotes(event.target.value)} placeholder="Ghi chú chuyển tiền" disabled={!isAdmin} className={`${inputClass()} md:col-span-2 xl:col-span-5`} />
                  </form>
                </Card>

                <Card eyebrow="Danh sách nguồn" title="Số dư và trạng thái">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {accounts.map((account) => (
                      <div key={account.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{account.name}</h3><p className="mt-1 text-xs text-zinc-500">{ACCOUNT_TYPES.find((item) => item.value === account.account_type)?.label}</p></div><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${account.is_active ? "bg-emerald-400/10 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}>{account.is_active ? "Active" : "Inactive"}</span></div>
                        <p className={`mt-4 text-2xl font-semibold ${(accountBalances.get(account.id) || 0) < 0 ? "text-rose-300" : "text-yellow-300"}`}>{money(accountBalances.get(account.id) || 0)}</p>
                        <p className="mt-1 text-xs text-zinc-500">Số dư đầu kỳ: {money(account.opening_balance)}</p>
                        {isAdmin ? <button type="button" onClick={() => void toggleAccount(account)} className="mt-4 text-xs text-zinc-400 hover:text-yellow-300">{account.is_active ? "Ngừng sử dụng" : "Kích hoạt lại"}</button> : null}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card eyebrow="Lịch sử chuyển khoản" title="100 giao dịch gần nhất">
                  <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Ngày</th><th className="px-3 py-3">Từ</th><th className="px-3 py-3">Đến</th><th className="px-3 py-3">Số tiền</th><th className="px-3 py-3">Ghi chú</th></tr></thead><tbody>{transfers.map((row) => <tr key={row.id} className="border-b border-white/10"><td className="px-3 py-3">{formatDate(row.transfer_date)}</td><td className="px-3 py-3">{accountMap.get(row.from_account_id)?.name || "-"}</td><td className="px-3 py-3">{accountMap.get(row.to_account_id)?.name || "-"}</td><td className="px-3 py-3 text-yellow-300">{money(row.amount)}</td><td className="px-3 py-3 text-zinc-400">{row.notes || "-"}</td></tr>)}</tbody></table></div>
                </Card>
              </div>
            ) : null}

            {activeTab === "categories" ? (
              <div className="mt-4 space-y-4">
                <Card eyebrow="Danh mục custom" title="Thêm loại chi phí riêng">
                  <form onSubmit={addCustomCategory} className="grid gap-3 md:grid-cols-[2fr_2fr_1fr]">
                    <input value={customCategoryName} onChange={(event) => setCustomCategoryName(event.target.value)} placeholder="Ví dụ: Phí vệ sinh, đào tạo nhân sự..." disabled={!isAdmin} className={inputClass()} />
                    <select value={customCategoryGroup} onChange={(event) => setCustomCategoryGroup(event.target.value as ReportGroup)} disabled={!isAdmin} className={selectClass()}>{CUSTOM_REPORT_GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                    <button disabled={!isAdmin} className="rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black disabled:opacity-50">Thêm danh mục</button>
                  </form>
                </Card>

                <Card eyebrow="Cấu trúc chi phí" title="Danh mục hệ thống và custom">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {categories.map((category) => (
                      <div key={category.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{category.name}</h3><p className="mt-1 text-xs text-zinc-500">{REPORT_GROUP_LABELS[category.report_group]}</p></div><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${category.is_system ? "bg-yellow-400/10 text-yellow-300" : "bg-sky-400/10 text-sky-300"}`}>{category.is_system ? "System" : "Custom"}</span></div>
                        <p className="mt-3 text-sm text-zinc-400">Đã hạch toán tháng này: <strong className="text-white">{money(categoryTotals.get(category.id) || 0)}</strong></p>
                        {!category.is_system && isAdmin ? <div className="mt-4 flex gap-3"><button type="button" onClick={() => void renameCustomCategory(category)} className="text-xs text-yellow-300">Đổi tên</button><button type="button" onClick={() => void toggleCustomCategory(category)} className="text-xs text-zinc-400">{category.is_active ? "Ẩn" : "Hiện"}</button></div> : null}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}

            {activeTab === "profit_loss" ? (
              <div className="mt-4 space-y-4">
                <section className="grid gap-3 sm:grid-cols-3">
                  <Kpi label="Doanh thu" value={money(profitLoss.revenue)} detail={monthLabel(selectedMonth)} tone="green" />
                  <Kpi label="Chi phí" value={money(profitLoss.expenses)} detail="Không tính mua tài sản trực tiếp" tone="red" />
                  <Kpi label="Lợi nhuận" value={money(profitLoss.net)} detail="Báo cáo quản trị nội bộ" tone={profitLoss.net >= 0 ? "yellow" : "red"} />
                </section>

                <Card eyebrow="Báo cáo lãi lỗ" title={`Phân loại ${monthLabel(selectedMonth)}`}>
                  <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="bg-yellow-400 text-black"><th className="px-4 py-3">Nhóm</th><th className="px-4 py-3 text-right">Số tiền</th></tr></thead><tbody>{(Object.keys(REPORT_GROUP_LABELS) as ReportGroup[]).filter((group) => group !== "cash_only").map((group) => <tr key={group} className="border-b border-white/10"><td className="px-4 py-3">{REPORT_GROUP_LABELS[group]}</td><td className="px-4 py-3 text-right font-semibold">{money(profitLoss.groups.get(group) || 0)}</td></tr>)}</tbody><tfoot><tr className="bg-white/[0.05]"><td className="px-4 py-4 font-semibold">Lợi nhuận quản trị</td><td className={`px-4 py-4 text-right text-lg font-semibold ${profitLoss.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(profitLoss.net)}</td></tr></tfoot></table></div>
                  <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.06] p-4 text-sm leading-6 text-zinc-300">
                    Chi phí mua máy móc được theo dõi là dòng tiền đầu tư và không cộng toàn bộ vào chi phí tháng. Chi phí khấu hao được ghi riêng vào lãi lỗ. Đây là báo cáo quản trị nội bộ, không thay thế hồ sơ thuế hoặc báo cáo pháp định.
                  </div>
                </Card>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editingPayable ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-yellow-400/30 bg-[#0b0b0b] shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b0b0b]/95 p-5 backdrop-blur">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-400">Công nợ phải trả</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Chỉnh sửa công nợ</h2>
                <p className="mt-2 text-sm text-zinc-400">Mọi thay đổi đều yêu cầu lý do và được lưu vào lịch sử kế toán.</p>
              </div>
              <button type="button" onClick={() => setEditingPayable(null)} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-zinc-300 hover:text-white">Đóng</button>
            </header>

            <form onSubmit={savePayableEdit} className="p-5">
              {editingPayable.paidAmount > 0 ? (
                <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 text-sm leading-6 text-amber-100">
                  Khoản này đã thanh toán {money(editingPayable.paidAmount)}. Danh mục, PT/đối tượng và tháng hạch toán được khóa để không làm sai lịch sử giao dịch. Tổng công nợ chỉ có thể đặt bằng hoặc cao hơn số đã trả.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Danh mục chi phí</span>
                  <select
                    value={editingPayable.categoryId}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, categoryId: event.target.value, trainerId: "", counterparty: "" } : current)}
                    disabled={editingPayable.paidAmount > 0 || saving}
                    className={selectClass()}
                    required
                  >
                    <option value="">Chọn danh mục</option>
                    {activeExpenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>

                {categoryMap.get(editingPayable.categoryId)?.system_key === "salary" ? (
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-yellow-300">PT / nhân sự *</span>
                    <select
                      value={editingPayable.trainerId}
                      onChange={(event) => setEditingPayable((current) => current ? { ...current, trainerId: event.target.value } : current)}
                      disabled={editingPayable.paidAmount > 0 || saving}
                      className={selectClass()}
                      required
                    >
                      <option value="">Chọn PT / nhân sự</option>
                      {staff.map((person) => <option key={person.id} value={person.id}>{staffName(person)}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Đối tượng phải trả</span>
                    <input
                      value={editingPayable.counterparty}
                      onChange={(event) => setEditingPayable((current) => current ? { ...current, counterparty: event.target.value } : current)}
                      disabled={editingPayable.paidAmount > 0 || saving}
                      className={inputClass()}
                      required
                    />
                  </label>
                )}

                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tiêu đề công nợ</span>
                  <input
                    value={editingPayable.title}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, title: event.target.value } : current)}
                    disabled={saving}
                    className={inputClass()}
                    required
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tổng phải trả CAD</span>
                  <input
                    type="number"
                    min={Math.max(editingPayable.paidAmount, 0.01)}
                    step="0.01"
                    value={editingPayable.totalAmount}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, totalAmount: event.target.value } : current)}
                    disabled={saving}
                    className={inputClass()}
                    required
                  />
                  <span className="text-xs text-zinc-600">Đã trả: {money(editingPayable.paidAmount)}</span>
                </label>

                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Tháng hạch toán</span>
                  <input
                    type="month"
                    value={editingPayable.accountingMonth}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, accountingMonth: event.target.value } : current)}
                    disabled={editingPayable.paidAmount > 0 || saving}
                    className={inputClass()}
                    required
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Hạn thanh toán</span>
                  <input
                    type="date"
                    value={editingPayable.dueDate}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, dueDate: event.target.value } : current)}
                    disabled={saving}
                    className={inputClass()}
                  />
                </label>

                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Ghi chú</span>
                  <textarea
                    value={editingPayable.notes}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, notes: event.target.value } : current)}
                    disabled={saving}
                    className={`${inputClass()} min-h-24`}
                  />
                </label>

                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-rose-300">Lý do chỉnh sửa *</span>
                  <textarea
                    value={editingPayable.editReason}
                    onChange={(event) => setEditingPayable((current) => current ? { ...current, editReason: event.target.value } : current)}
                    placeholder="Ví dụ: Điều chỉnh số tiền theo hóa đơn chính thức; sửa hạn thanh toán theo thỏa thuận mới..."
                    disabled={saving}
                    className={`${inputClass()} min-h-24 border-rose-400/30 focus:border-rose-300`}
                    required
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setEditingPayable(null)} disabled={saving} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-300 disabled:opacity-50">Hủy</button>
                <button disabled={saving} className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold uppercase text-black disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu chỉnh sửa"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
