"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type AdminRole = "admin" | "manager";
type PayableStatus = "unpaid" | "partial" | "paid" | "cancelled";

type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type SessionRow = {
  id: string;
  trainer_id: string | null;
  status: string | null;
  session_type: string | null;
  created_at: string;
};

type SalaryPayable = {
  id: string;
  accounting_month: string;
  payable_type: string;
  counterparty: string;
  title: string;
  total_amount: number | string;
  paid_amount: number | string;
  due_date: string | null;
  notes: string | null;
  status: PayableStatus;
  category_id: string | null;
  trainer_id: string | null;
  created_at: string;
};

type FinanceAccount = {
  id: string;
  name: string;
  opening_balance: number | string;
  is_active: boolean;
};

type FinanceCategory = {
  id: string;
  name: string;
  system_key: string | null;
  report_group: string;
};

type BusinessTransaction = {
  id: string;
  transaction_type: "income" | "expense" | "cash_adjustment";
  amount: number | string;
  account_id: string | null;
};

type TrainerSummary = {
  trainer: StaffProfile;
  success: number;
  noShow: number;
  lateCancel: number;
  nutritionFollowUp: number;
  payableTotal: number;
  paidTotal: number;
  remaining: number;
  payableCount: number;
};

function currentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(monthKey: string) {
  return `${monthKey}-01`;
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
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

function staffName(profile: StaffProfile | undefined) {
  return profile?.full_name || profile?.email || "Không rõ";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN");
}

function inputClass() {
  return "w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-400 disabled:opacity-50";
}

function selectClass() {
  return "w-full rounded-xl border border-white/15 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-yellow-400 disabled:opacity-50";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function PayrollPage() {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [payables, setPayables] = useState<SalaryPayable[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);

  const [trainerId, setTrainerId] = useState("");
  const [salaryTitle, setSalaryTitle] = useState("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryDueDate, setSalaryDueDate] = useState("");
  const [salaryNotes, setSalaryNotes] = useState("");

  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentAccounts, setPaymentAccounts] = useState<Record<string, string>>({});
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});

  const isAdmin = role === "admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const range = monthRange(selectedMonth);

    const [staffResult, sessionResult, payableResult, accountResult, categoryResult, transactionResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["trainer", "nutrition_coach"])
          .order("full_name"),
        supabase
          .from("session_history")
          .select("id, trainer_id, status, session_type, created_at")
          .gte("created_at", range.startIso)
          .lt("created_at", range.endIso),
        supabase
          .from("business_payables")
          .select("id, accounting_month, payable_type, counterparty, title, total_amount, paid_amount, due_date, notes, status, category_id, trainer_id, created_at")
          .eq("payable_type", "salary")
          .eq("accounting_month", monthStart(selectedMonth))
          .order("counterparty"),
        supabase
          .from("finance_accounts")
          .select("id, name, opening_balance, is_active")
          .order("is_active", { ascending: false })
          .order("name"),
        supabase
          .from("finance_categories")
          .select("id, name, system_key, report_group")
          .eq("system_key", "salary")
          .maybeSingle(),
        supabase
          .from("business_transactions")
          .select("id, transaction_type, amount, account_id"),
      ]);

    const firstError = [
      staffResult.error,
      sessionResult.error,
      payableResult.error,
      accountResult.error,
      categoryResult.error,
      transactionResult.error,
    ].find(Boolean);

    if (firstError) {
      setMessage(
        `${firstError.message}. Hãy chạy migration 20260806_finance_accounts_categories_payroll.sql trước.`,
      );
      setLoading(false);
      return;
    }

    const nextStaff = (staffResult.data || []) as StaffProfile[];
    const nextPayables = (payableResult.data || []) as SalaryPayable[];
    const nextAccounts = (accountResult.data || []) as FinanceAccount[];

    setStaff(nextStaff);
    setSessions((sessionResult.data || []) as SessionRow[]);
    setPayables(nextPayables);
    setAccounts(nextAccounts);
    setCategories(categoryResult.data ? [categoryResult.data as FinanceCategory] : []);
    setTransactions((transactionResult.data || []) as BusinessTransaction[]);

    setTrainerId((current) => current || nextStaff[0]?.id || "");
    setPaymentAccounts((current) => {
      const next = { ...current };
      const firstAccount = nextAccounts.find((row) => row.is_active)?.id || "";
      for (const payable of nextPayables) {
        if (!next[payable.id]) next[payable.id] = firstAccount;
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
    setLoading(false);
  }, [selectedMonth]);

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

  const staffMap = useMemo(() => new Map(staff.map((row) => [row.id, row])), [staff]);

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

  const summaries = useMemo<TrainerSummary[]>(() => {
    return staff.map((trainer) => {
      const trainerSessions = sessions.filter((row) => row.trainer_id === trainer.id);
      const trainerPayables = payables.filter((row) => row.trainer_id === trainer.id);

      return {
        trainer,
        success: trainerSessions.filter((row) => ["success", "completed"].includes(String(row.status || "").toLowerCase())).length,
        noShow: trainerSessions.filter((row) => String(row.status || "").toLowerCase() === "no_show").length,
        lateCancel: trainerSessions.filter((row) => String(row.status || "").toLowerCase() === "late_cancel").length,
        nutritionFollowUp: trainerSessions.filter((row) => row.session_type === "nutrition_follow_up").length,
        payableTotal: trainerPayables.reduce((sum, row) => sum + numberValue(row.total_amount), 0),
        paidTotal: trainerPayables.reduce((sum, row) => sum + numberValue(row.paid_amount), 0),
        remaining: trainerPayables.reduce(
          (sum, row) => sum + Math.max(numberValue(row.total_amount) - numberValue(row.paid_amount), 0),
          0,
        ),
        payableCount: trainerPayables.length,
      };
    });
  }, [payables, sessions, staff]);

  const totals = useMemo(
    () => ({
      staff: summaries.length,
      sessions: summaries.reduce((sum, row) => sum + row.success, 0),
      payroll: summaries.reduce((sum, row) => sum + row.payableTotal, 0),
      paid: summaries.reduce((sum, row) => sum + row.paidTotal, 0),
      remaining: summaries.reduce((sum, row) => sum + row.remaining, 0),
    }),
    [summaries],
  );

  useEffect(() => {
    const trainer = staffMap.get(trainerId);
    if (trainer && !salaryTitle.trim()) {
      setSalaryTitle(`Lương PT - ${staffName(trainer)} - ${selectedMonth}`);
    }
  }, [salaryTitle, selectedMonth, staffMap, trainerId]);

  async function addSalaryPayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const amount = Number(salaryAmount);
    const trainer = staffMap.get(trainerId);
    const salaryCategory = categories[0];

    if (!trainer || !salaryCategory) {
      setMessage("Không tìm thấy PT hoặc danh mục Lương.");
      return;
    }
    if (!salaryTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Tiêu đề và số tiền lương hợp lệ là bắt buộc.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("business_payables").insert({
      accounting_month: monthStart(selectedMonth),
      payable_type: "salary",
      counterparty: staffName(trainer),
      title: salaryTitle.trim(),
      total_amount: amount,
      paid_amount: 0,
      due_date: salaryDueDate || null,
      expense_group: salaryCategory.report_group,
      notes: salaryNotes.trim() || null,
      status: "unpaid",
      category_id: salaryCategory.id,
      trainer_id: trainer.id,
      created_by: userData.user?.id || null,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSalaryAmount("");
    setSalaryDueDate("");
    setSalaryNotes("");
    setSalaryTitle("");
    setMessage(`Đã tạo công nợ lương cho ${staffName(trainer)}.`);
    await fetchData();
  }

  async function paySalary(payable: SalaryPayable) {
    if (!isAdmin) return;

    const amount = Number(paymentAmounts[payable.id] || 0);
    const accountId = paymentAccounts[payable.id];
    const paymentDate = paymentDates[payable.id] || todayValue();
    const remaining = Math.max(
      numberValue(payable.total_amount) - numberValue(payable.paid_amount),
      0,
    );

    if (!payable.trainer_id) {
      setMessage("Khoản lương chưa gắn PT nên không thể thanh toán.");
      return;
    }
    if (!accountId || !Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setMessage("Chọn nguồn thanh toán và nhập số tiền hợp lệ.");
      return;
    }

    const trainer = staffMap.get(payable.trainer_id);
    const account = accounts.find((row) => row.id === accountId);
    if (!window.confirm(`Trả ${money(amount)} cho ${staffName(trainer)} từ ${account?.name || "nguồn tiền"}?`)) {
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("pay_business_payable_v2", {
      p_payable_id: payable.id,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_account_id: accountId,
      p_notes: `Payroll report ${selectedMonth}`,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPaymentAmounts((current) => ({ ...current, [payable.id]: "" }));
    setMessage(`Đã ghi nhận thanh toán lương cho ${staffName(trainer)}.`);
    await fetchData();
  }

  function exportCsv() {
    const rows = [
      [
        "Tháng",
        "PT / Nhân sự",
        "Role",
        "Buổi hoàn thành",
        "No-show",
        "Late cancel",
        "Nutrition follow-up",
        "Tổng lương",
        "Đã trả",
        "Còn lại",
      ],
      ...summaries.map((row) => [
        selectedMonth,
        staffName(row.trainer),
        row.trainer.role || "",
        row.success,
        row.noShow,
        row.lateCancel,
        row.nutritionFollowUp,
        row.payableTotal,
        row.paidTotal,
        row.remaining,
      ]),
    ];

    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fxa-bao-luong-pt-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Đang kiểm tra quyền báo lương...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070707] p-3 text-white md:p-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-3xl border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.15),_transparent_38%),#0b0b0b] p-5 md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-yellow-400">
                FXA FITNESS · PAYROLL
              </p>
              <h1 className="mt-2 text-3xl font-semibold md:text-5xl">Báo lương PT theo tháng</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Mỗi công nợ lương bắt buộc gắn chính xác PT. Trang tổng hợp session, tổng lương,
                số đã trả, số còn lại và nguồn tiền dùng để thanh toán.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Link href="/admin/revenue" className="rounded-xl border border-yellow-400/30 px-4 py-3 text-center text-xs font-semibold uppercase text-yellow-300 hover:bg-yellow-400 hover:text-black">
                Trang kế toán
              </Link>
              <button type="button" onClick={exportCsv} className="rounded-xl border border-white/15 px-4 py-3 text-xs font-semibold uppercase text-zinc-300 hover:border-yellow-400 hover:text-yellow-300">
                Xuất CSV
              </button>
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="rounded-xl border border-yellow-400/30 bg-black px-4 py-3 text-sm text-yellow-300" />
            </div>
          </div>
          {role === "manager" ? (
            <div className="mt-5 rounded-2xl border border-sky-400/20 bg-sky-400/[0.08] p-3 text-sm text-sky-200">
              Manager chỉ xem báo cáo. Chỉ Admin được tạo và thanh toán lương.
            </div>
          ) : null}
        </header>

        {message ? (
          <div className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.08] p-4 text-sm text-yellow-100">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-16 text-center text-yellow-400">
            Đang tải báo lương...
          </div>
        ) : (
          <>
            <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs uppercase text-zinc-500">PT / nhân sự</p><p className="mt-2 text-2xl font-semibold">{totals.staff}</p></div>
              <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] p-4"><p className="text-xs uppercase text-zinc-500">Session hoàn thành</p><p className="mt-2 text-2xl font-semibold text-sky-300">{totals.sessions}</p></div>
              <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.07] p-4"><p className="text-xs uppercase text-zinc-500">Tổng lương</p><p className="mt-2 text-2xl font-semibold text-yellow-300">{money(totals.payroll)}</p></div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4"><p className="text-xs uppercase text-zinc-500">Đã trả</p><p className="mt-2 text-2xl font-semibold text-emerald-300">{money(totals.paid)}</p></div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4"><p className="text-xs uppercase text-zinc-500">Còn phải trả</p><p className="mt-2 text-2xl font-semibold text-rose-300">{money(totals.remaining)}</p></div>
            </section>

            {isAdmin ? (
              <section className="mt-4 rounded-3xl border border-yellow-400/20 bg-white/[0.04] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">Tạo công nợ lương</p>
                <h2 className="mt-1 text-2xl font-semibold">{monthLabel(selectedMonth)}</h2>
                <form onSubmit={addSalaryPayable} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1"><span className="text-xs font-semibold text-yellow-300">PT / nhân sự *</span><select value={trainerId} onChange={(event) => { setTrainerId(event.target.value); setSalaryTitle(""); }} className={selectClass()}><option value="">Chọn PT</option>{staff.map((person) => <option key={person.id} value={person.id}>{staffName(person)} · {person.role}</option>)}</select></label>
                  <label className="grid gap-1 xl:col-span-2"><span className="text-xs text-zinc-400">Tiêu đề</span><input value={salaryTitle} onChange={(event) => setSalaryTitle(event.target.value)} className={inputClass()} required /></label>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Tổng lương CAD</span><input type="number" min="0.01" step="0.01" value={salaryAmount} onChange={(event) => setSalaryAmount(event.target.value)} className={inputClass()} required /></label>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Hạn trả</span><input type="date" value={salaryDueDate} onChange={(event) => setSalaryDueDate(event.target.value)} className={inputClass()} /></label>
                  <label className="grid gap-1 md:col-span-2"><span className="text-xs text-zinc-400">Ghi chú / cách tính</span><textarea value={salaryNotes} onChange={(event) => setSalaryNotes(event.target.value)} placeholder="Ví dụ: lương cố định + commission..." className={`${inputClass()} min-h-20`} /></label>
                  <button disabled={saving} className="rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black disabled:opacity-50">Tạo công nợ lương</button>
                </form>
              </section>
            ) : null}

            <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">Tổng hợp theo PT</p>
              <h2 className="mt-1 text-2xl font-semibold">{monthLabel(selectedMonth)}</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">PT / Nhân sự</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Success</th><th className="px-3 py-3">No-show</th><th className="px-3 py-3">Late cancel</th><th className="px-3 py-3">Nutrition</th><th className="px-3 py-3">Tổng lương</th><th className="px-3 py-3">Đã trả</th><th className="px-3 py-3">Còn lại</th></tr></thead>
                  <tbody>{summaries.map((row) => <tr key={row.trainer.id} className="border-b border-white/10"><td className="px-3 py-3 font-semibold">{staffName(row.trainer)}</td><td className="px-3 py-3">{row.trainer.role}</td><td className="px-3 py-3 text-emerald-300">{row.success}</td><td className="px-3 py-3">{row.noShow}</td><td className="px-3 py-3">{row.lateCancel}</td><td className="px-3 py-3">{row.nutritionFollowUp}</td><td className="px-3 py-3 text-yellow-300">{money(row.payableTotal)}</td><td className="px-3 py-3 text-emerald-300">{money(row.paidTotal)}</td><td className="px-3 py-3 text-rose-300">{money(row.remaining)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-yellow-400">Chi tiết công nợ lương</p>
              <h2 className="mt-1 text-2xl font-semibold">Thanh toán theo đúng PT và nguồn tiền</h2>
              <div className="mt-5 space-y-3">
                {payables.map((payable) => {
                  const remaining = Math.max(numberValue(payable.total_amount) - numberValue(payable.paid_amount), 0);
                  return (
                    <div key={payable.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-1 text-[10px] uppercase text-yellow-300">{payable.status}</span><span className="text-xs text-zinc-500">Hạn {formatDate(payable.due_date)}</span></div><h3 className="mt-2 font-semibold">{payable.title}</h3><p className="mt-1 text-sm text-yellow-200">PT: {staffName(staffMap.get(payable.trainer_id || ""))}</p>{payable.notes ? <p className="mt-2 text-sm text-zinc-400">{payable.notes}</p> : null}</div>
                        <div className="grid grid-cols-3 gap-4 text-right text-sm"><div><p className="text-zinc-500">Tổng</p><p className="font-semibold">{money(payable.total_amount)}</p></div><div><p className="text-zinc-500">Đã trả</p><p className="font-semibold text-emerald-300">{money(payable.paid_amount)}</p></div><div><p className="text-zinc-500">Còn lại</p><p className="font-semibold text-rose-300">{money(remaining)}</p></div></div>
                      </div>
                      {isAdmin && remaining > 0 ? (
                        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:grid-cols-4">
                          <input type="number" min="0.01" step="0.01" max={remaining} value={paymentAmounts[payable.id] || ""} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [payable.id]: event.target.value }))} placeholder={`Tối đa ${remaining}`} className={inputClass()} />
                          <select value={paymentAccounts[payable.id] || ""} onChange={(event) => setPaymentAccounts((current) => ({ ...current, [payable.id]: event.target.value }))} className={selectClass()}><option value="">Nguồn trả lương</option>{accounts.filter((row) => row.is_active).map((account) => <option key={account.id} value={account.id}>{account.name} · {money(accountBalances.get(account.id) || 0)}</option>)}</select>
                          <input type="date" value={paymentDates[payable.id] || todayValue()} onChange={(event) => setPaymentDates((current) => ({ ...current, [payable.id]: event.target.value }))} className={inputClass()} />
                          <button type="button" onClick={() => void paySalary(payable)} disabled={saving} className="rounded-xl bg-yellow-400 px-4 py-2 font-semibold text-black disabled:opacity-50">Trả lương</button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {payables.length === 0 ? <p className="py-10 text-center text-zinc-500">Chưa có công nợ lương trong tháng.</p> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
