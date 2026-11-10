"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { businessDate } from "@/lib/businessTime";
import { getCurrentUserRole } from "@/lib/checkUserRole";
import { supabase } from "@/lib/supabaseClient";

type Role = "admin" | "manager";

type Account = {
  id: string;
  name: string;
  is_active: boolean;
};

type ClientRelation = {
  id: string;
  full_name: string | null;
  client_code: string | null;
};

type Receivable = {
  id: string;
  client_id: string;
  plan_name: string | null;
  price: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  debt_deadline: string | null;
  debt_month: string | null;
  created_at: string;
  clients: ClientRelation | ClientRelation[] | null;
};

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
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN");
}

function getClient(value: Receivable["clients"]) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function debtState(row: Receivable) {
  if (!row.debt_deadline) return "open" as const;
  const today = businessDate();
  if (row.debt_deadline < today) return "overdue" as const;
  const deadline = new Date(`${row.debt_deadline}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const days = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  if (days <= 7) return "due_soon" as const;
  return "open" as const;
}

export default function ReceivablesPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | "due_soon">("all");
  const [rows, setRows] = useState<Receivable[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [accountIds, setAccountIds] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const isAdmin = role === "admin";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const [debtResult, accountResult] = await Promise.all([
      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, price, amount_paid, balance_due, debt_deadline, debt_month, created_at, clients(id, full_name, client_code)",
        )
        .gt("balance_due", 0)
        .order("debt_deadline", { ascending: true, nullsFirst: false })
        .limit(1000),
      supabase
        .from("finance_accounts")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name"),
    ]);

    const error = debtResult.error || accountResult.error;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const nextRows = (debtResult.data || []) as Receivable[];
    const nextAccounts = (accountResult.data || []) as Account[];
    const firstAccountId = nextAccounts[0]?.id || "";

    setRows(nextRows);
    setAccounts(nextAccounts);
    setAccountIds((current) => {
      const next = { ...current };
      for (const row of nextRows) if (!next[row.id]) next[row.id] = firstAccountId;
      return next;
    });
    setDates((current) => {
      const next = { ...current };
      for (const row of nextRows) if (!next[row.id]) next[row.id] = businessDate();
      return next;
    });
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
        await fetchData();
        return;
      }
      router.push("/client");
    }
    void protect();
  }, [fetchData, router]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const client = getClient(row.clients);
      const state = debtState(row);
      if (filter !== "all" && state !== filter) return false;
      if (!query) return true;
      return [client?.full_name, client?.client_code, row.plan_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, rows, search]);

  const totals = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + numberValue(row.balance_due), 0);
    const overdue = rows
      .filter((row) => debtState(row) === "overdue")
      .reduce((sum, row) => sum + numberValue(row.balance_due), 0);
    const dueSoon = rows
      .filter((row) => debtState(row) === "due_soon")
      .reduce((sum, row) => sum + numberValue(row.balance_due), 0);
    return { total, overdue, dueSoon };
  }, [rows]);

  async function collect(row: Receivable) {
    if (!isAdmin || savingId) return;
    const amount = Number(amounts[row.id] || 0);
    const remaining = numberValue(row.balance_due);
    const accountId = accountIds[row.id];
    const paymentDate = dates[row.id] || businessDate();

    if (!accountId) {
      setMessage("Hãy chọn nguồn tiền nhận thanh toán.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setMessage(`Số tiền phải lớn hơn 0 và không vượt quá ${money(remaining)}.`);
      return;
    }

    const client = getClient(row.clients);
    if (!window.confirm(`Ghi nhận ${money(amount)} từ ${client?.full_name || "khách hàng"}?`)) {
      return;
    }

    setSavingId(row.id);
    setMessage("");
    const { error } = await supabase.rpc("record_client_debt_payment_v2", {
      p_purchase_id: row.id,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_account_id: accountId,
      p_notes: notes[row.id]?.trim() || null,
    });
    setSavingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAmounts((current) => ({ ...current, [row.id]: "" }));
    setNotes((current) => ({ ...current, [row.id]: "" }));
    setMessage("Đã thu công nợ, cập nhật số dư khách và tạo giao dịch thu vào đúng nguồn tiền.");
    await fetchData();
    window.dispatchEvent(new Event("fxa:finance-updated"));
  }

  if (!role && loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Đang tải công nợ khách hàng...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070707] p-3 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="rounded-3xl border border-yellow-400/25 bg-[#0b0b0b] p-5 md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                FXA FITNESS · ACCOUNTS RECEIVABLE
              </p>
              <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Thu công nợ khách hàng</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Thu tiền trực tiếp vào nguồn tiền, giảm balance due và tự tạo giao dịch Revenue liên kết với package.
              </p>
            </div>
            <Link
              href="/admin/revenue"
              className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-semibold text-zinc-200 hover:border-yellow-400 hover:text-yellow-300"
            >
              ← Quay lại Accounting
            </Link>
          </div>
          {role === "manager" ? (
            <p className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.08] p-3 text-sm text-sky-200">
              Manager chỉ xem. Chỉ Admin được ghi nhận thanh toán.
            </p>
          ) : null}
        </header>

        {message ? (
          <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.08] p-4 text-sm text-yellow-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Tổng phải thu</p>
            <p className="mt-2 text-2xl font-semibold text-yellow-300">{money(totals.total)}</p>
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Quá hạn</p>
            <p className="mt-2 text-2xl font-semibold text-rose-300">{money(totals.overdue)}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Đến hạn ≤ 7 ngày</p>
            <p className="mt-2 text-2xl font-semibold text-amber-300">{money(totals.dueSoon)}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên khách, client code, package..."
              className="rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm outline-none focus:border-yellow-400"
            />
            <div className="flex flex-wrap gap-2">
              {(["all", "overdue", "due_soon"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-xl px-4 py-3 text-xs font-semibold ${
                    filter === item ? "bg-yellow-400 text-black" : "border border-white/15 text-zinc-300"
                  }`}
                >
                  {item === "all" ? "Tất cả" : item === "overdue" ? "Quá hạn" : "Sắp đến hạn"}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center text-yellow-400">
              Đang tải...
            </div>
          ) : null}

          {!loading && visibleRows.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center text-zinc-500">
              Không có công nợ phù hợp bộ lọc.
            </div>
          ) : null}

          {visibleRows.map((row) => {
            const client = getClient(row.clients);
            const remaining = numberValue(row.balance_due);
            const state = debtState(row);
            return (
              <article key={row.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
                <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr_auto] xl:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{client?.full_name || "Không rõ"}</h2>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                          state === "overdue"
                            ? "bg-rose-400/10 text-rose-300"
                            : state === "due_soon"
                              ? "bg-amber-400/10 text-amber-300"
                              : "bg-zinc-700/60 text-zinc-300"
                        }`}
                      >
                        {state === "overdue" ? "Quá hạn" : state === "due_soon" ? "Sắp đến hạn" : "Đang mở"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{row.plan_name || "Package"}</p>
                    <p className="mt-1 text-xs text-zinc-600">{client?.client_code || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-zinc-500">Đã thu / Giá gói</p>
                    <p className="mt-1 font-semibold text-emerald-300">{money(row.amount_paid)} / {money(row.price)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-zinc-500">Còn nợ</p>
                    <p className="mt-1 text-xl font-semibold text-rose-300">{money(remaining)}</p>
                    <p className="mt-1 text-xs text-zinc-500">Hạn: {formatDate(row.debt_deadline)}</p>
                  </div>
                  <div className="text-xs text-zinc-500">Ghi nhận: {formatDate(row.debt_month || row.created_at)}</div>
                </div>

                {isAdmin ? (
                  <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:grid-cols-2 xl:grid-cols-5">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={remaining}
                      value={amounts[row.id] || ""}
                      onChange={(event) => setAmounts((current) => ({ ...current, [row.id]: event.target.value }))}
                      placeholder={`Thu tối đa ${money(remaining)}`}
                      className="rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-yellow-400"
                    />
                    <select
                      value={accountIds[row.id] || ""}
                      onChange={(event) => setAccountIds((current) => ({ ...current, [row.id]: event.target.value }))}
                      className="rounded-xl border border-white/15 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-yellow-400"
                    >
                      <option value="">Nguồn nhận tiền</option>
                      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                    <input
                      type="date"
                      value={dates[row.id] || businessDate()}
                      onChange={(event) => setDates((current) => ({ ...current, [row.id]: event.target.value }))}
                      className="rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-yellow-400"
                    />
                    <input
                      value={notes[row.id] || ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                      placeholder="Ghi chú (tuỳ chọn)"
                      className="rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={() => void collect(row)}
                      disabled={savingId === row.id}
                      className="rounded-xl bg-yellow-400 px-4 py-2.5 font-semibold text-black disabled:opacity-50"
                    >
                      {savingId === row.id ? "Đang ghi..." : "Ghi nhận thu"}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
