"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type EditSection =
  | "transactions"
  | "payables"
  | "accounts"
  | "transfers"
  | "client_debts";

type BusinessTransaction = {
  id: string;
  transaction_type: string;
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

type EditTarget =
  | { kind: "transaction"; row: BusinessTransaction }
  | { kind: "payable"; row: BusinessPayable }
  | { kind: "opening_balance"; row: FinanceAccount }
  | { kind: "current_balance"; row: FinanceAccount; currentBalance: number }
  | { kind: "transfer"; row: FinanceTransfer }
  | { kind: "client_purchase"; row: ClientPurchase };

const SECTION_BUTTONS: Array<{
  key: EditSection;
  label: string;
  shortLabel: string;
}> = [
  { key: "transactions", label: "Sửa Thu / Chi", shortLabel: "Thu / Chi" },
  { key: "payables", label: "Sửa Công nợ", shortLabel: "Công nợ" },
  { key: "accounts", label: "Sửa Nguồn tiền", shortLabel: "Nguồn tiền" },
  { key: "transfers", label: "Sửa Chuyển khoản", shortLabel: "Chuyển khoản" },
  { key: "client_debts", label: "Sửa Công nợ KH", shortLabel: "Công nợ KH" },
];

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
  return date.toLocaleDateString("vi-VN");
}

function getClient(value: ClientPurchase["clients"]) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function inputClass() {
  return "w-full rounded-xl border border-white/15 bg-black/80 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-400";
}

function rowButtonClass() {
  return "rounded-xl border border-yellow-400/35 px-3 py-2 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-400 hover:text-black";
}

export default function RevenueInlineEditControls() {
  const [section, setSection] = useState<EditSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [payables, setPayables] = useState<BusinessPayable[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [clientPurchases, setClientPurchases] = useState<ClientPurchase[]>([]);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [reason, setReason] = useState("");
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [value3, setValue3] = useState("");
  const [adjustmentAccountId, setAdjustmentAccountId] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const [transactionResult, payableResult, accountResult, transferResult, purchaseResult] =
      await Promise.all([
        supabase
          .from("business_transactions")
          .select(
            "id, transaction_type, title, amount, transaction_date, payable_id, transfer_id, account_id",
          )
          .order("transaction_date", { ascending: false })
          .limit(1000),
        supabase
          .from("business_payables")
          .select("id, title, counterparty, total_amount, paid_amount, status")
          .order("updated_at", { ascending: false })
          .limit(500),
        supabase
          .from("finance_accounts")
          .select("id, name, opening_balance, is_active")
          .order("is_active", { ascending: false })
          .order("name"),
        supabase
          .from("finance_transfers")
          .select("id, from_account_id, to_account_id, amount, transfer_date")
          .order("transfer_date", { ascending: false })
          .limit(500),
        supabase
          .from("client_purchases")
          .select(
            "id, plan_name, price, amount_paid, balance_due, clients(id, full_name, client_code)",
          )
          .order("created_at", { ascending: false })
          .limit(1000),
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
    setLoading(false);
  }, []);

  useEffect(() => {
    if (section) void fetchData();
  }, [section, fetchData]);

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

  const cleanSearch = search.trim().toLowerCase();

  const visibleTransactions = useMemo(() => {
    if (!cleanSearch) return transactions;
    return transactions.filter((row) =>
      [row.title, row.transaction_type, row.transaction_date]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch),
    );
  }, [transactions, cleanSearch]);

  const visiblePayables = useMemo(() => {
    if (!cleanSearch) return payables;
    return payables.filter((row) =>
      [row.title, row.counterparty, row.status]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch),
    );
  }, [payables, cleanSearch]);

  const visibleAccounts = useMemo(() => {
    if (!cleanSearch) return accounts;
    return accounts.filter((row) => row.name.toLowerCase().includes(cleanSearch));
  }, [accounts, cleanSearch]);

  const visibleTransfers = useMemo(() => {
    if (!cleanSearch) return transfers;
    return transfers.filter((row) => {
      const from = accountMap.get(row.from_account_id)?.name || "";
      const to = accountMap.get(row.to_account_id)?.name || "";
      return [from, to, row.transfer_date].join(" ").toLowerCase().includes(cleanSearch);
    });
  }, [transfers, accountMap, cleanSearch]);

  const visibleClientPurchases = useMemo(() => {
    if (!cleanSearch) return clientPurchases;
    return clientPurchases.filter((row) => {
      const client = getClient(row.clients);
      return [client?.full_name || "", client?.client_code || "", row.plan_name || ""]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch);
    });
  }, [clientPurchases, cleanSearch]);

  function openSection(nextSection: EditSection) {
    setSection(nextSection);
    setSearch("");
    setMessage("");
    setEditTarget(null);
  }

  function closePanel() {
    if (saving) return;
    setSection(null);
    setEditTarget(null);
    setSearch("");
    setMessage("");
  }

  function closeEditor() {
    if (saving) return;
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
    setMessage("");

    if (target.kind === "transaction") {
      setValue1(String(target.row.amount));
      setValue2("");
      setValue3("");
      return;
    }

    if (target.kind === "payable") {
      setValue1(String(target.row.total_amount));
      setValue2(String(target.row.paid_amount));
      setValue3("");

      const linkedTransaction = transactions.find(
        (transaction) =>
          transaction.payable_id === target.row.id && transaction.account_id,
      );
      setAdjustmentAccountId(linkedTransaction?.account_id || "");
      return;
    }

    if (target.kind === "opening_balance") {
      setValue1(String(target.row.opening_balance));
      setValue2("");
      setValue3("");
      return;
    }

    if (target.kind === "current_balance") {
      setValue1(String(target.currentBalance));
      setValue2("");
      setValue3("");
      return;
    }

    if (target.kind === "transfer") {
      setValue1(String(target.row.amount));
      setValue2("");
      setValue3("");
      return;
    }

    setValue1(String(target.row.price ?? 0));
    setValue2(String(target.row.amount_paid ?? 0));
    setValue3(String(target.row.balance_due ?? 0));
  }

  async function saveEdit() {
    if (!editTarget || saving) return;

    const cleanReason = reason.trim();
    if (!cleanReason) {
      setMessage("Lý do chỉnh sửa là bắt buộc.");
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
        setMessage("Nhập số tiền hợp lệ.");
        return;
      }

      const result = await supabase.rpc("admin_edit_finance_transaction_amount", {
        p_transaction_id: editTarget.row.id,
        p_new_amount: first,
        p_reason: cleanReason,
      });
      error = result.error;
    }

    if (editTarget.kind === "payable") {
      if (!Number.isFinite(first) || !Number.isFinite(second)) {
        setSaving(false);
        setMessage("Nhập tổng công nợ và số đã trả hợp lệ.");
        return;
      }

      const result = await supabase.rpc("admin_edit_business_payable_numbers", {
        p_payable_id: editTarget.row.id,
        p_new_total_amount: first,
        p_new_paid_amount: second,
        p_adjustment_account_id: adjustmentAccountId || null,
        p_reason: cleanReason,
      });
      error = result.error;
    }

    if (editTarget.kind === "opening_balance") {
      if (!Number.isFinite(first)) {
        setSaving(false);
        setMessage("Nhập opening balance hợp lệ.");
        return;
      }

      const result = await supabase.rpc("admin_edit_finance_account_opening_balance", {
        p_account_id: editTarget.row.id,
        p_new_opening_balance: first,
        p_reason: cleanReason,
      });
      error = result.error;
    }

    if (editTarget.kind === "current_balance") {
      if (!Number.isFinite(first)) {
        setSaving(false);
        setMessage("Nhập current balance hợp lệ.");
        return;
      }

      const result = await supabase.rpc("admin_set_finance_account_current_balance", {
        p_account_id: editTarget.row.id,
        p_new_balance: first,
        p_reason: cleanReason,
      });
      error = result.error;
    }

    if (editTarget.kind === "transfer") {
      if (!Number.isFinite(first) || first <= 0) {
        setSaving(false);
        setMessage("Số tiền chuyển khoản phải lớn hơn 0.");
        return;
      }

      const result = await supabase.rpc("admin_edit_finance_transfer_amount", {
        p_transfer_id: editTarget.row.id,
        p_new_amount: first,
        p_reason: cleanReason,
      });
      error = result.error;
    }

    if (editTarget.kind === "client_purchase") {
      if (![first, second, third].every(Number.isFinite)) {
        setSaving(false);
        setMessage("Nhập đầy đủ các con số hợp lệ.");
        return;
      }

      const result = await supabase.rpc("admin_edit_client_purchase_numbers", {
        p_purchase_id: editTarget.row.id,
        p_new_price: first,
        p_new_amount_paid: second,
        p_new_balance_due: third,
        p_reason: cleanReason,
      });
      error = result.error;
    }

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    closeEditor();
    setMessage("Đã cập nhật. Các số tổng hợp Revenue sẽ tự tính lại từ dữ liệu nguồn.");
    await fetchData();
  }

  function transactionEditButton(row: BusinessTransaction) {
    if (row.payable_id) {
      return (
        <button
          type="button"
          onClick={() => openSection("payables")}
          className={rowButtonClass()}
        >
          Sửa ở Công nợ
        </button>
      );
    }

    if (row.transfer_id) {
      return (
        <button
          type="button"
          onClick={() => openSection("transfers")}
          className={rowButtonClass()}
        >
          Sửa ở Chuyển khoản
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => openEditor({ kind: "transaction", row })}
        className={rowButtonClass()}
      >
        Edit
      </button>
    );
  }

  function panelTitle() {
    return SECTION_BUTTONS.find((item) => item.key === section)?.label || "Sửa Revenue";
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-yellow-400/15 bg-black/95 px-3 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto">
          <span className="mr-1 shrink-0 rounded-lg bg-yellow-400 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-black">
            Admin Edit
          </span>
          {SECTION_BUTTONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => openSection(item.key)}
              className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-400/40 hover:text-yellow-300"
            >
              {item.shortLabel}
              <span className="ml-1 text-yellow-400">Edit</span>
            </button>
          ))}
        </div>
      </div>

      {section ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm md:items-center md:p-5">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-t-[2rem] border border-yellow-400/25 bg-[#0a0a0a] shadow-2xl md:rounded-[2rem]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 p-4 md:p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-yellow-400">
                  Admin Only
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white md:text-2xl">
                  {panelTitle()}
                </h2>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.06]"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/10 p-3 md:p-4">
              {SECTION_BUTTONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openSection(item.key)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    section === item.key
                      ? "bg-yellow-400 text-black"
                      : "border border-white/10 text-zinc-300"
                  }`}
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border-b border-white/10 p-3 md:p-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên, nội dung, khách hàng..."
                className={inputClass()}
              />
              <button
                type="button"
                onClick={() => void fetchData()}
                disabled={loading}
                className="shrink-0 rounded-xl border border-yellow-400/30 px-4 py-2.5 text-xs font-semibold text-yellow-300 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {message ? (
              <div className="mx-3 mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.07] p-3 text-sm text-yellow-100 md:mx-4">
                {message}
              </div>
            ) : null}

            <div className="overflow-auto p-3 md:p-4">
              {loading ? (
                <div className="py-12 text-center text-sm text-yellow-400">
                  Đang tải dữ liệu...
                </div>
              ) : null}

              {!loading && section === "transactions" ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-yellow-400 text-black">
                      <tr>
                        <th className="px-3 py-3">Ngày</th>
                        <th className="px-3 py-3">Loại</th>
                        <th className="px-3 py-3">Nội dung</th>
                        <th className="px-3 py-3">Số tiền</th>
                        <th className="px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTransactions.map((row) => (
                        <tr key={row.id} className="border-b border-white/10">
                          <td className="px-3 py-3 text-zinc-400">{formatDate(row.transaction_date)}</td>
                          <td className="px-3 py-3">{row.transaction_type}</td>
                          <td className="px-3 py-3 font-medium text-white">{row.title}</td>
                          <td className="px-3 py-3 text-yellow-300">{money(row.amount)}</td>
                          <td className="px-3 py-3 text-right">{transactionEditButton(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {!loading && section === "payables" ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-yellow-400 text-black">
                      <tr>
                        <th className="px-3 py-3">Đối tượng</th>
                        <th className="px-3 py-3">Nội dung</th>
                        <th className="px-3 py-3">Tổng</th>
                        <th className="px-3 py-3">Đã trả</th>
                        <th className="px-3 py-3">Trạng thái</th>
                        <th className="px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePayables.map((row) => (
                        <tr key={row.id} className="border-b border-white/10">
                          <td className="px-3 py-3">{row.counterparty}</td>
                          <td className="px-3 py-3 font-medium">{row.title}</td>
                          <td className="px-3 py-3 text-yellow-300">{money(row.total_amount)}</td>
                          <td className="px-3 py-3 text-emerald-300">{money(row.paid_amount)}</td>
                          <td className="px-3 py-3 text-zinc-400">{row.status}</td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openEditor({ kind: "payable", row })}
                              className={rowButtonClass()}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {!loading && section === "accounts" ? (
                <div className="space-y-3">
                  {visibleAccounts.map((row) => {
                    const currentBalance = accountBalances.get(row.id) ?? numberValue(row.opening_balance);
                    return (
                      <div
                        key={row.id}
                        className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[1fr_auto_auto] md:items-center"
                      >
                        <div>
                          <p className="font-semibold text-white">{row.name}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Opening {money(row.opening_balance)} · Current {money(currentBalance)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditor({ kind: "opening_balance", row })}
                          className={rowButtonClass()}
                        >
                          Edit Opening
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openEditor({ kind: "current_balance", row, currentBalance })
                          }
                          className={rowButtonClass()}
                        >
                          Edit Current
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {!loading && section === "transfers" ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-yellow-400 text-black">
                      <tr>
                        <th className="px-3 py-3">Ngày</th>
                        <th className="px-3 py-3">Từ</th>
                        <th className="px-3 py-3">Đến</th>
                        <th className="px-3 py-3">Số tiền</th>
                        <th className="px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTransfers.map((row) => (
                        <tr key={row.id} className="border-b border-white/10">
                          <td className="px-3 py-3 text-zinc-400">{formatDate(row.transfer_date)}</td>
                          <td className="px-3 py-3">{accountMap.get(row.from_account_id)?.name || "-"}</td>
                          <td className="px-3 py-3">{accountMap.get(row.to_account_id)?.name || "-"}</td>
                          <td className="px-3 py-3 text-yellow-300">{money(row.amount)}</td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openEditor({ kind: "transfer", row })}
                              className={rowButtonClass()}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {!loading && section === "client_debts" ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="bg-yellow-400 text-black">
                      <tr>
                        <th className="px-3 py-3">Khách hàng</th>
                        <th className="px-3 py-3">Gói / Nội dung</th>
                        <th className="px-3 py-3">Giá</th>
                        <th className="px-3 py-3">Đã thu</th>
                        <th className="px-3 py-3">Còn nợ</th>
                        <th className="px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleClientPurchases.map((row) => {
                        const client = getClient(row.clients);
                        return (
                          <tr key={row.id} className="border-b border-white/10">
                            <td className="px-3 py-3">
                              <p className="font-medium">{client?.full_name || "Không rõ"}</p>
                              <p className="text-xs text-zinc-500">{client?.client_code || "-"}</p>
                            </td>
                            <td className="px-3 py-3">{row.plan_name || "Client purchase"}</td>
                            <td className="px-3 py-3 text-yellow-300">{money(row.price)}</td>
                            <td className="px-3 py-3 text-emerald-300">{money(row.amount_paid)}</td>
                            <td className="px-3 py-3 text-rose-300">{money(row.balance_due)}</td>
                            <td className="px-3 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openEditor({ kind: "client_purchase", row })}
                                className={rowButtonClass()}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {editTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-yellow-400/30 bg-[#0b0b0b] p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-yellow-400">
                  Edit Number
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-white">
                  {editTarget.kind === "transaction" ? "Thu / Chi" : null}
                  {editTarget.kind === "payable" ? "Công nợ phải trả" : null}
                  {editTarget.kind === "opening_balance" ? "Opening Balance" : null}
                  {editTarget.kind === "current_balance" ? "Current Balance" : null}
                  {editTarget.kind === "transfer" ? "Chuyển khoản" : null}
                  {editTarget.kind === "client_purchase" ? "Công nợ khách hàng" : null}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {editTarget.kind === "transaction" ? (
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-400">Amount</span>
                  <input value={value1} onChange={(event) => setValue1(event.target.value)} type="number" step="0.01" className={inputClass()} />
                </label>
              ) : null}

              {editTarget.kind === "payable" ? (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-400">Total Amount</span>
                    <input value={value1} onChange={(event) => setValue1(event.target.value)} type="number" min="0" step="0.01" className={inputClass()} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-400">Paid Amount</span>
                    <input value={value2} onChange={(event) => setValue2(event.target.value)} type="number" min="0" step="0.01" className={inputClass()} />
                  </label>
                  {Number(value2) !== numberValue(editTarget.row.paid_amount) ? (
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Cash account for paid-amount correction</span>
                      <select
                        value={adjustmentAccountId}
                        onChange={(event) => setAdjustmentAccountId(event.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-white px-3 py-2.5 text-sm text-black outline-none"
                      >
                        <option value="">Choose account</option>
                        {accounts.filter((account) => account.is_active).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}

              {editTarget.kind === "opening_balance" || editTarget.kind === "current_balance" ? (
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-400">
                    {editTarget.kind === "opening_balance" ? "Opening Balance" : "Current Balance"}
                  </span>
                  <input value={value1} onChange={(event) => setValue1(event.target.value)} type="number" step="0.01" className={inputClass()} />
                </label>
              ) : null}

              {editTarget.kind === "transfer" ? (
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-400">Transfer Amount</span>
                  <input value={value1} onChange={(event) => setValue1(event.target.value)} type="number" min="0" step="0.01" className={inputClass()} />
                </label>
              ) : null}

              {editTarget.kind === "client_purchase" ? (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-400">Price</span>
                    <input value={value1} onChange={(event) => setValue1(event.target.value)} type="number" min="0" step="0.01" className={inputClass()} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-400">Amount Paid</span>
                    <input value={value2} onChange={(event) => setValue2(event.target.value)} type="number" min="0" step="0.01" className={inputClass()} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-400">Balance Due</span>
                    <input value={value3} onChange={(event) => setValue3(event.target.value)} type="number" min="0" step="0.01" className={inputClass()} />
                  </label>
                </>
              ) : null}

              <label className="grid gap-1">
                <span className="text-xs text-zinc-400">Lý do chỉnh sửa *</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ví dụ: nhập sai số tiền ban đầu"
                  className={`${inputClass()} min-h-24 resize-none`}
                />
              </label>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-zinc-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
