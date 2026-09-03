"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type TransactionType = "income" | "expense" | "cash_adjustment";

type BusinessTransaction = {
  id: string;
  transaction_type: TransactionType;
  title: string;
  amount: number | string;
  transaction_date: string;
  payable_id: string | null;
  transfer_id: string | null;
  account_id: string | null;
};

type BusinessPayable = {
  id: string;
  title: string;
  counterparty: string;
  total_amount: number | string;
  paid_amount: number | string;
  status: string;
};

type FinanceAccount = {
  id: string;
  name: string;
  opening_balance: number | string;
  is_active: boolean;
};

type FinanceTransfer = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number | string;
  transfer_date: string;
};

type ClientRelation = {
  id: string;
  full_name: string | null;
  client_code: string | null;
};

type ClientPurchase = {
  id: string;
  plan_name: string | null;
  price: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  clients: ClientRelation | ClientRelation[] | null;
};

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string;
  field_name: string;
  old_value: number | string | null;
  new_value: number | string | null;
  reason: string;
  edited_at: string;
};

type EditTarget =
  | { kind: "transaction"; row: BusinessTransaction }
  | { kind: "payable"; row: BusinessPayable }
  | { kind: "opening_balance"; row: FinanceAccount }
  | { kind: "current_balance"; row: FinanceAccount; currentBalance: number }
  | { kind: "transfer"; row: FinanceTransfer }
  | { kind: "client_purchase"; row: ClientPurchase };

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
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getClient(value: ClientPurchase["clients"]) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function inputClass() {
  return "w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-400";
}

export default function AdminRevenueEditPage() {
  const router = useRouter();
  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [payables, setPayables] = useState<BusinessPayable[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [clientPurchases, setClientPurchases] = useState<ClientPurchase[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [reason, setReason] = useState("");
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [value3, setValue3] = useState("");
  const [adjustmentAccountId, setAdjustmentAccountId] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const [transactionResult, payableResult, accountResult, transferResult, purchaseResult, auditResult] =
      await Promise.all([
        supabase
          .from("business_transactions")
          .select("id, transaction_type, title, amount, transaction_date, payable_id, transfer_id, account_id")
          .order("transaction_date", { ascending: false })
          .limit(300),
        supabase
          .from("business_payables")
          .select("id, title, counterparty, total_amount, paid_amount, status")
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase
          .from("finance_accounts")
          .select("id, name, opening_balance, is_active")
          .order("is_active", { ascending: false })
          .order("name"),
        supabase
          .from("finance_transfers")
          .select("id, from_account_id, to_account_id, amount, transfer_date")
          .order("transfer_date", { ascending: false })
          .limit(200),
        supabase
          .from("client_purchases")
          .select("id, plan_name, price, amount_paid, balance_due, clients(id, full_name, client_code)")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("finance_edit_audit")
          .select("id, table_name, record_id, field_name, old_value, new_value, reason, edited_at")
          .order("edited_at", { ascending: false })
          .limit(100),
      ]);

    const firstError = [
      transactionResult.error,
      payableResult.error,
      accountResult.error,
      transferResult.error,
      purchaseResult.error,
    ].find(Boolean);

    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    setTransactions((transactionResult.data || []) as BusinessTransaction[]);
    setPayables((payableResult.data || []) as BusinessPayable[]);
    setAccounts((accountResult.data || []) as FinanceAccount[]);
    setTransfers((transferResult.data || []) as FinanceTransfer[]);
    setClientPurchases((purchaseResult.data || []) as ClientPurchase[]);

    if (!auditResult.error) {
      setAuditRows((auditResult.data || []) as AuditRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    async function protect() {
      const { user, role } = await getCurrentUserRole();
      if (!user) {
        router.push("/login");
        return;
      }
      if (role !== "admin") {
        if (role === "manager") {
          router.push("/admin/revenue");
          return;
        }
        if (role === "trainer" || role === "nutrition_coach") {
          router.push("/trainer/scan");
          return;
        }
        router.push("/client");
        return;
      }

      setCheckingRole(false);
      await fetchData();
    }

    void protect();
  }, [fetchData, router]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const accountBalances = useMemo(() => {
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

  function closeEditor() {
    setEditTarget(null);
    setReason("");
    setValue1("");
    setValue2("");
    setValue3("");
    setAdjustmentAccountId("");
  }

  function openEditor(target: EditTarget) {
    setEditTarget(target);
    setReason("");
    setAdjustmentAccountId("");

    if (target.kind === "transaction") {
      setValue1(String(target.row.amount));
      setValue2("");
      setValue3("");
    }

    if (target.kind === "payable") {
      setValue1(String(target.row.total_amount));
      setValue2(String(target.row.paid_amount));
      setValue3("");
      const linkedTransaction = transactions.find(
        (transaction) => transaction.payable_id === target.row.id && transaction.account_id,
      );
      setAdjustmentAccountId(linkedTransaction?.account_id || "");
    }

    if (target.kind === "opening_balance") {
      setValue1(String(target.row.opening_balance));
      setValue2("");
      setValue3("");
    }

    if (target.kind === "current_balance") {
      setValue1(String(target.currentBalance));
      setValue2("");
      setValue3("");
    }

    if (target.kind === "transfer") {
      setValue1(String(target.row.amount));
      setValue2("");
      setValue3("");
    }

    if (target.kind === "client_purchase") {
      setValue1(String(target.row.price ?? 0));
      setValue2(String(target.row.amount_paid ?? 0));
      setValue3(String(target.row.balance_due ?? 0));
    }
  }

  async function saveEdit() {
    if (!editTarget || saving) return;
    if (!reason.trim()) {
      setMessage("Edit reason is required.");
      return;
    }

    const first = Number(value1);
    const second = Number(value2);
    const third = Number(value3);

    setSaving(true);
    setMessage("");

    let error: { message: string } | null = null;

    if (editTarget.kind === "transaction") {
      if (!Number.isFinite(first)) {
        setSaving(false);
        setMessage("Enter a valid amount.");
        return;
      }
      const result = await supabase.rpc("admin_edit_finance_transaction_amount", {
        p_transaction_id: editTarget.row.id,
        p_new_amount: first,
        p_reason: reason.trim(),
      });
      error = result.error;
    }

    if (editTarget.kind === "payable") {
      if (!Number.isFinite(first) || !Number.isFinite(second)) {
        setSaving(false);
        setMessage("Enter valid payable amounts.");
        return;
      }
      const result = await supabase.rpc("admin_edit_business_payable_numbers", {
        p_payable_id: editTarget.row.id,
        p_new_total_amount: first,
        p_new_paid_amount: second,
        p_adjustment_account_id: adjustmentAccountId || null,
        p_reason: reason.trim(),
      });
      error = result.error;
    }

    if (editTarget.kind === "opening_balance") {
      if (!Number.isFinite(first)) {
        setSaving(false);
        setMessage("Enter a valid opening balance.");
        return;
      }
      const result = await supabase.rpc("admin_edit_finance_account_opening_balance", {
        p_account_id: editTarget.row.id,
        p_new_opening_balance: first,
        p_reason: reason.trim(),
      });
      error = result.error;
    }

    if (editTarget.kind === "current_balance") {
      if (!Number.isFinite(first)) {
        setSaving(false);
        setMessage("Enter a valid current balance.");
        return;
      }
      const result = await supabase.rpc("admin_set_finance_account_current_balance", {
        p_account_id: editTarget.row.id,
        p_new_balance: first,
        p_reason: reason.trim(),
      });
      error = result.error;
    }

    if (editTarget.kind === "transfer") {
      if (!Number.isFinite(first) || first <= 0) {
        setSaving(false);
        setMessage("Transfer amount must be greater than 0.");
        return;
      }
      const result = await supabase.rpc("admin_edit_finance_transfer_amount", {
        p_transfer_id: editTarget.row.id,
        p_new_amount: first,
        p_reason: reason.trim(),
      });
      error = result.error;
    }

    if (editTarget.kind === "client_purchase") {
      if (![first, second, third].every(Number.isFinite)) {
        setSaving(false);
        setMessage("Enter valid client purchase numbers.");
        return;
      }
      const result = await supabase.rpc("admin_edit_client_purchase_numbers", {
        p_purchase_id: editTarget.row.id,
        p_new_price: first,
        p_new_amount_paid: second,
        p_new_balance_due: third,
        p_reason: reason.trim(),
      });
      error = result.error;
    }

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    closeEditor();
    setMessage("Numbers updated. Revenue summaries will recalculate from the corrected source data.");
    await fetchData();
  }

  if (checkingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-400">
        Checking Admin access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070707] p-3 text-white md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-yellow-400/20 bg-yellow-400/[0.05] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-400">
              Admin Only
            </p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Revenue Number Editor</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Correct source numbers here. Dashboard totals, cash flow and P&amp;L remain calculated values and update automatically.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <Link href="/admin/revenue" className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-black">
              Back to Revenue
            </Link>
          </div>
        </header>

        {message ? (
          <div className="mb-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.06] p-4 text-sm text-yellow-100">
            {message}
          </div>
        ) : null}

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">Transactions / Revenue / Expenses</h2>
            <p className="mt-1 text-sm text-zinc-500">Edit standalone transaction amounts. Payable and transfer-linked rows must be corrected in their own section.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Title</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Action</th></tr></thead>
                <tbody>
                  {transactions.map((row) => {
                    const linked = Boolean(row.payable_id || row.transfer_id);
                    return (
                      <tr key={row.id} className="border-b border-white/10">
                        <td className="px-3 py-3">{formatDate(row.transaction_date)}</td>
                        <td className="px-3 py-3 uppercase text-zinc-400">{row.transaction_type}</td>
                        <td className="px-3 py-3">{row.title}</td>
                        <td className="px-3 py-3 text-right font-semibold text-yellow-300">{money(row.amount)}</td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={linked}
                            onClick={() => openEditor({ kind: "transaction", row })}
                            className="text-xs font-semibold text-cyan-300 disabled:text-zinc-700"
                          >
                            {linked ? "Edit linked record" : "Edit amount"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">Payables</h2>
            <p className="mt-1 text-sm text-zinc-500">Admin can correct both total amount and paid amount. Paid amount corrections create a cash-only adjustment so account balances remain consistent.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Counterparty</th><th className="px-3 py-3">Title</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-right">Paid</th><th className="px-3 py-3 text-right">Remaining</th><th className="px-3 py-3">Action</th></tr></thead>
                <tbody>
                  {payables.map((row) => (
                    <tr key={row.id} className="border-b border-white/10">
                      <td className="px-3 py-3">{row.counterparty}</td>
                      <td className="px-3 py-3">{row.title}</td>
                      <td className="px-3 py-3 text-right">{money(row.total_amount)}</td>
                      <td className="px-3 py-3 text-right text-emerald-300">{money(row.paid_amount)}</td>
                      <td className="px-3 py-3 text-right text-rose-300">{money(Math.max(numberValue(row.total_amount) - numberValue(row.paid_amount), 0))}</td>
                      <td className="px-3 py-3"><button type="button" onClick={() => openEditor({ kind: "payable", row })} className="text-xs font-semibold text-cyan-300">Edit numbers</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">Finance Accounts</h2>
            <p className="mt-1 text-sm text-zinc-500">Opening balance can be corrected directly. Current balance is corrected with an audit-safe cash adjustment.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map((row) => {
                const currentBalance = accountBalances.get(row.id) || 0;
                return (
                  <div key={row.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <h3 className="font-semibold">{row.name}</h3>
                    <p className="mt-3 text-sm text-zinc-400">Opening: <strong className="text-white">{money(row.opening_balance)}</strong></p>
                    <p className="mt-1 text-sm text-zinc-400">Current: <strong className={currentBalance < 0 ? "text-rose-300" : "text-yellow-300"}>{money(currentBalance)}</strong></p>
                    <div className="mt-4 flex gap-4">
                      <button type="button" onClick={() => openEditor({ kind: "opening_balance", row })} className="text-xs font-semibold text-cyan-300">Edit opening</button>
                      <button type="button" onClick={() => openEditor({ kind: "current_balance", row, currentBalance })} className="text-xs font-semibold text-yellow-300">Set current</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">Internal Transfers</h2>
            <p className="mt-1 text-sm text-zinc-500">Changing a transfer updates both linked ledger sides together.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Date</th><th className="px-3 py-3">From</th><th className="px-3 py-3">To</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Action</th></tr></thead>
                <tbody>
                  {transfers.map((row) => (
                    <tr key={row.id} className="border-b border-white/10">
                      <td className="px-3 py-3">{formatDate(row.transfer_date)}</td>
                      <td className="px-3 py-3">{accountMap.get(row.from_account_id)?.name || "-"}</td>
                      <td className="px-3 py-3">{accountMap.get(row.to_account_id)?.name || "-"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-yellow-300">{money(row.amount)}</td>
                      <td className="px-3 py-3"><button type="button" onClick={() => openEditor({ kind: "transfer", row })} className="text-xs font-semibold text-cyan-300">Edit amount</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">Client Purchase / Receivable Numbers</h2>
            <p className="mt-1 text-sm text-zinc-500">Correct package price, amount paid and balance due. This does not create or remove cash transactions automatically.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Client</th><th className="px-3 py-3">Purchase</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3 text-right">Paid</th><th className="px-3 py-3 text-right">Balance</th><th className="px-3 py-3">Action</th></tr></thead>
                <tbody>
                  {clientPurchases.map((row) => {
                    const client = getClient(row.clients);
                    return (
                      <tr key={row.id} className="border-b border-white/10">
                        <td className="px-3 py-3">{client?.full_name || "Unknown"}<p className="text-xs text-zinc-500">{client?.client_code || "-"}</p></td>
                        <td className="px-3 py-3">{row.plan_name || "Purchase"}</td>
                        <td className="px-3 py-3 text-right">{money(row.price)}</td>
                        <td className="px-3 py-3 text-right text-emerald-300">{money(row.amount_paid)}</td>
                        <td className="px-3 py-3 text-right text-rose-300">{money(row.balance_due)}</td>
                        <td className="px-3 py-3"><button type="button" onClick={() => openEditor({ kind: "client_purchase", row })} className="text-xs font-semibold text-cyan-300">Edit numbers</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">Finance Edit Audit</h2>
            <p className="mt-1 text-sm text-zinc-500">Latest 100 numeric corrections.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead><tr className="bg-yellow-400 text-black"><th className="px-3 py-3">Edited</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Field</th><th className="px-3 py-3 text-right">Old</th><th className="px-3 py-3 text-right">New</th><th className="px-3 py-3">Reason</th></tr></thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id} className="border-b border-white/10">
                      <td className="px-3 py-3">{formatDate(row.edited_at)}</td>
                      <td className="px-3 py-3 text-zinc-400">{row.table_name}</td>
                      <td className="px-3 py-3">{row.field_name}</td>
                      <td className="px-3 py-3 text-right text-zinc-400">{money(row.old_value)}</td>
                      <td className="px-3 py-3 text-right text-yellow-300">{money(row.new_value)}</td>
                      <td className="px-3 py-3">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditRows.length === 0 ? <p className="py-6 text-center text-zinc-600">No edits recorded yet.</p> : null}
            </div>
          </section>
        </div>
      </div>

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-yellow-400/30 bg-[#111] p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-400">Admin Correction</p>
            <h2 className="mt-2 text-2xl font-semibold">Edit Source Numbers</h2>

            <div className="mt-5 grid gap-4">
              {editTarget.kind === "transaction" ? (
                <label className="grid gap-1"><span className="text-xs text-zinc-400">Amount</span><input type="number" step="0.01" value={value1} onChange={(event) => setValue1(event.target.value)} className={inputClass()} /></label>
              ) : null}

              {editTarget.kind === "payable" ? (
                <>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Total Amount</span><input type="number" min="0" step="0.01" value={value1} onChange={(event) => setValue1(event.target.value)} className={inputClass()} /></label>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Paid Amount</span><input type="number" min="0" step="0.01" value={value2} onChange={(event) => setValue2(event.target.value)} className={inputClass()} /></label>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Cash account for paid-amount difference</span><select value={adjustmentAccountId} onChange={(event) => setAdjustmentAccountId(event.target.value)} className="w-full rounded-xl border border-white/15 bg-white px-3 py-2.5 text-sm text-black outline-none"><option value="">Use previous payment account when available</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                </>
              ) : null}

              {editTarget.kind === "opening_balance" ? (
                <label className="grid gap-1"><span className="text-xs text-zinc-400">Opening Balance</span><input type="number" step="0.01" value={value1} onChange={(event) => setValue1(event.target.value)} className={inputClass()} /></label>
              ) : null}

              {editTarget.kind === "current_balance" ? (
                <label className="grid gap-1"><span className="text-xs text-zinc-400">Current Balance</span><input type="number" step="0.01" value={value1} onChange={(event) => setValue1(event.target.value)} className={inputClass()} /></label>
              ) : null}

              {editTarget.kind === "transfer" ? (
                <label className="grid gap-1"><span className="text-xs text-zinc-400">Transfer Amount</span><input type="number" min="0.01" step="0.01" value={value1} onChange={(event) => setValue1(event.target.value)} className={inputClass()} /></label>
              ) : null}

              {editTarget.kind === "client_purchase" ? (
                <>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Price</span><input type="number" min="0" step="0.01" value={value1} onChange={(event) => setValue1(event.target.value)} className={inputClass()} /></label>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Amount Paid</span><input type="number" min="0" step="0.01" value={value2} onChange={(event) => setValue2(event.target.value)} className={inputClass()} /></label>
                  <label className="grid gap-1"><span className="text-xs text-zinc-400">Balance Due</span><input type="number" min="0" step="0.01" value={value3} onChange={(event) => setValue3(event.target.value)} className={inputClass()} /></label>
                </>
              ) : null}

              <label className="grid gap-1">
                <span className="text-xs font-semibold text-yellow-300">Edit Reason *</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this number being corrected?" className={`${inputClass()} min-h-24`} />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeEditor} disabled={saving} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void saveEdit()} disabled={saving || !reason.trim()} className="rounded-xl bg-yellow-400 px-5 py-2 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Saving..." : "Save Correction"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
