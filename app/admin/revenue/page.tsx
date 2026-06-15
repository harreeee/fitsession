"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";
import { useRouter } from "next/navigation";
import Link from "next/link";

type BusinessTransaction = {
  id: string;
  transaction_type: "income" | "expense" | "cash_adjustment";
  source: string;
  title: string;
  amount: number;
  notes: string | null;
  transaction_date: string;
  created_at: string;
};

function getMonthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function AdminRevenuePage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [message, setMessage] = useState("");

  const [transactionType, setTransactionType] =
    useState<"income" | "expense" | "cash_adjustment">("income");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer") {
          router.push("/trainer/scan");
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      await fetchTransactions();
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  async function fetchTransactions() {
    const { data, error } = await supabase
      .from("business_transactions")
      .select("*")
      .order("transaction_date", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTransactions((data || []) as BusinessTransaction[]);
  }

  const summary = useMemo(() => {
    const thisMonth = getMonthRange(0);
    const lastMonth = getMonthRange(-1);

    const currentMonthTransactions = transactions.filter(
      (transaction) =>
        transaction.transaction_date >= thisMonth.start &&
        transaction.transaction_date < thisMonth.end
    );

    const lastMonthTransactions = transactions.filter(
      (transaction) =>
        transaction.transaction_date >= lastMonth.start &&
        transaction.transaction_date < lastMonth.end
    );

    const currentRevenue = currentMonthTransactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const lastRevenue = lastMonthTransactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const currentExpenses = currentMonthTransactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const allIncome = transactions
      .filter((transaction) => transaction.transaction_type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const allExpenses = transactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const cashAdjustments = transactions
      .filter(
        (transaction) => transaction.transaction_type === "cash_adjustment"
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const cashOnHand = allIncome + cashAdjustments - allExpenses;

    let revenueChangePercent = 0;

    if (lastRevenue > 0) {
      revenueChangePercent =
        ((currentRevenue - lastRevenue) / lastRevenue) * 100;
    } else if (currentRevenue > 0) {
      revenueChangePercent = 100;
    }

    return {
      currentRevenue,
      lastRevenue,
      currentExpenses,
      currentNet: currentRevenue - currentExpenses,
      revenueChangePercent,
      cashOnHand,
      totalTransactions: currentMonthTransactions.length,
    };
  }, [transactions]);

  async function addTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const parsedAmount = Number(amount);

    if (!title.trim()) {
      setMessage("Title is required.");
      return;
    }

    if (Number.isNaN(parsedAmount)) {
      setMessage("Amount must be a number.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("business_transactions").insert({
      transaction_type: transactionType,
      source: "manual",
      title: title.trim(),
      amount: parsedAmount,
      notes: notes.trim() || null,
      created_by: userData.user?.id || null,
      transaction_date: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTitle("");
    setAmount("");
    setNotes("");
    setTransactionType("income");
    setMessage("Transaction added.");
    await fetchTransactions();
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="font-black text-yellow-400">Checking admin access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Revenue
              </h1>

              <p className="mt-3 text-sm font-medium text-gray-400 md:text-base">
                Track monthly revenue, expenses, cash flow, and business
                performance.
              </p>
            </div>

            <Link
              href="/admin"
              className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Admin Dashboard
            </Link>
          </header>

          {message && (
            <div className="mb-6 rounded-3xl border border-yellow-500/30 bg-yellow-400/10 p-5 text-sm font-bold text-yellow-300">
              {message}
            </div>
          )}

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Revenue This Month
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {money(summary.currentRevenue)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Last Month
              </p>
              <p className="mt-3 text-4xl font-black text-white">
                {money(summary.lastRevenue)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Revenue Change
              </p>
              <p
                className={`mt-3 text-4xl font-black ${
                  summary.revenueChangePercent >= 0
                    ? "text-green-300"
                    : "text-red-300"
                }`}
              >
                {summary.revenueChangePercent.toFixed(1)}%
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Cash On Hand
              </p>
              <p className="mt-3 text-4xl font-black text-yellow-400">
                {money(summary.cashOnHand)}
              </p>
            </div>
          </section>

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-black/40 p-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Expenses This Month
              </p>
              <p className="mt-3 text-3xl font-black text-red-300">
                {money(summary.currentExpenses)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-black/40 p-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Net This Month
              </p>
              <p className="mt-3 text-3xl font-black text-green-300">
                {money(summary.currentNet)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-black/40 p-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                Transactions This Month
              </p>
              <p className="mt-3 text-3xl font-black text-yellow-400">
                {summary.totalTransactions}
              </p>
            </div>
          </section>

          <section className="mb-8 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <h2 className="mb-5 text-2xl font-black uppercase">
              Add Manual Transaction
            </h2>

            <form
              onSubmit={addTransaction}
              className="grid gap-4 md:grid-cols-2"
            >
              <select
                value={transactionType}
                onChange={(event) =>
                  setTransactionType(
                    event.target.value as
                      | "income"
                      | "expense"
                      | "cash_adjustment"
                  )
                }
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="cash_adjustment">Cash Adjustment</option>
              </select>

              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount"
                type="number"
                step="0.01"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes"
                className="rounded-2xl border border-yellow-500/30 bg-black/50 p-4 font-bold text-white outline-none"
              />

              <button className="rounded-2xl bg-yellow-400 p-4 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 md:col-span-2">
                Add Transaction
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-8">
            <h2 className="mb-5 text-2xl font-black uppercase">
              Recent Transactions
            </h2>

            <div className="space-y-4">
              {transactions.length === 0 && (
                <p className="font-bold text-gray-400">
                  No transactions yet.
                </p>
              )}

              {transactions.slice(0, 30).map((transaction) => (
                <div
                  key={transaction.id}
                  className="rounded-3xl border border-yellow-500/30 bg-black/40 p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xl font-black text-white">
                        {transaction.title}
                      </p>

                      <p className="mt-1 text-sm font-bold text-gray-400">
                        {transaction.transaction_date} · {transaction.source}
                      </p>

                      {transaction.notes && (
                        <p className="mt-2 text-sm text-gray-500">
                          {transaction.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-left md:text-right">
                      <p
                        className={`text-2xl font-black ${
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
                        {money(Number(transaction.amount))}
                      </p>

                      <p className="mt-1 text-xs font-black uppercase tracking-wide text-gray-400">
                        {transaction.transaction_type}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}