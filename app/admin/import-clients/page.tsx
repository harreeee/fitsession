"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ImportRole = "admin";

type RawRow = Record<string, unknown>;

type ParsedClientRow = {
  rowNumber: number;
  clientCode: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string | null;
  purchaseDate: string | null;
  expireDate: string | null;
  totalSessions: number;
  remainingSessions: number;
  usedSessions: number;
  status: "active" | "inactive";
  packageName: string;
  packageValue: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  purchaseType: "new" | "renew";
  clientSource: string | null;
  clientSourceOther: string | null;
  error: string;
};

type ImportSummary = {
  readyRows: number;
  errorRows: number;
  totalSessions: number;
  remainingSessions: number;
  totalDebt: number;
};

type ImportResult = {
  rowNumber: number;
  fullName: string;
  status: "success" | "error";
  message: string;
};

type ExistingClient = {
  id: string;
  client_code: string | null;
  full_name: string;
  email: string | null;
};

const SOURCE_MAP: Record<string, string> = {
  coach: "coach",
  google: "google",
  facebook: "facebook",
  instagram: "instagram",
  walkin: "direct_lead_walk_in",
  "walk in": "direct_lead_walk_in",
  "direct lead walk in": "direct_lead_walk_in",
  referral: "referral_lead",
  "referral lead": "referral_lead",
  other: "other",
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function getValue(row: RawRow, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeKey(key))) {
      if (value === null || value === undefined) return "";
      return String(value).trim();
    }
  }

  return "";
}

function parseMoney(value: string) {
  if (!value) return null;

  const cleanedValue = value.replace(/[^0-9.-]/g, "");
  const numberValue = Number(cleanedValue);

  if (Number.isNaN(numberValue)) return null;

  return numberValue;
}

function parseNumber(value: string) {
  if (!value) return 0;

  const cleanedValue = value.replace(/[^0-9.-]/g, "");
  const numberValue = Number(cleanedValue);

  if (Number.isNaN(numberValue)) return 0;

  return Math.max(0, Math.round(numberValue));
}

function excelSerialDateToIso(value: number) {
  const utcDays = Math.floor(value - 25569);
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  if (!value) return null;

  const trimmedValue = value.trim();

  if (!trimmedValue) return null;

  const numberValue = Number(trimmedValue);

  if (!Number.isNaN(numberValue) && numberValue > 25000 && numberValue < 90000) {
    return excelSerialDateToIso(numberValue);
  }

  const slashMatch = trimmedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;

    const date = new Date(year, month - 1, day);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const date = new Date(trimmedValue);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function normalizeStatus(value: string, remainingSessions: number) {
  const cleanValue = normalizeKey(value);

  if (
    cleanValue.includes("active") ||
    cleanValue.includes("dang tap") ||
    cleanValue.includes("con tap")
  ) {
    return "active";
  }

  if (
    cleanValue.includes("inactive") ||
    cleanValue.includes("expired") ||
    cleanValue.includes("het han") ||
    cleanValue.includes("ngung")
  ) {
    return "inactive";
  }

  return remainingSessions > 0 ? "active" : "inactive";
}

function normalizePurchaseType(value: string): "new" | "renew" {
  const cleanValue = normalizeKey(value);

  if (
    cleanValue.includes("renew") ||
    cleanValue.includes("renewal") ||
    cleanValue.includes("gia han") ||
    cleanValue.includes("tai tuc")
  ) {
    return "renew";
  }

  return "new";
}

function normalizeClientSource(value: string) {
  if (!value) {
    return {
      clientSource: null,
      clientSourceOther: null,
    };
  }

  const cleanValue = normalizeKey(value);
  const mappedSource = SOURCE_MAP[cleanValue];

  if (mappedSource) {
    return {
      clientSource: mappedSource,
      clientSourceOther: mappedSource === "other" ? value : null,
    };
  }

  return {
    clientSource: "other",
    clientSourceOther: value,
  };
}

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "-";

  return `$${Number(value).toLocaleString("en-CA", {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function parseRow(row: RawRow, index: number): ParsedClientRow {
  const clientCode = getValue(row, [
    "Mã khách hàng",
    "Ma khach hang",
    "Client Code",
    "client_code",
    "Code",
  ]);

  const fullName = getValue(row, [
    "Tên khách hàng",
    "Ten khach hang",
    "Full Name",
    "full_name",
    "Name",
    "Client Name",
  ]);

  const email = getValue(row, ["Email", "email"]);
  const phone = getValue(row, ["Phone", "Số điện thoại", "So dien thoai", "phone"]);
  const gender = getValue(row, ["Gender", "Giới tính", "Gioi tinh", "gender"]);

  const dateOfBirth = parseDate(
    getValue(row, [
      "Ngày tháng năm sinh",
      "Ngay thang nam sinh",
      "Năm tháng năm sinh",
      "Nam thang nam sinh",
      "Ngày sinh",
      "Ngay sinh",
      "Date of Birth",
      "DOB",
      "date_of_birth",
    ])
  );

  const purchaseDate = parseDate(
    getValue(row, [
      "Ngày mua",
      "Ngay mua",
      "Purchase Date",
      "purchase_date",
      "created_at",
      "Start Date",
    ])
  );

  const expireDate = parseDate(
    getValue(row, [
      "Ngày hết hạn",
      "Ngay het han",
      "Expire Date",
      "Expiry Date",
      "expires_at",
      "End Date",
    ])
  );

  const totalSessions = parseNumber(
    getValue(row, [
      "Số buổi",
      "So buoi",
      "Total Sessions",
      "total_sessions",
      "Sessions",
      "Session Count",
    ])
  );

  const explicitRemainingSessions = getValue(row, [
    "Buổi còn lại",
    "Buoi con lai",
    "Số buổi còn lại",
    "So buoi con lai",
    "Remaining Sessions",
    "remaining_sessions",
  ]);

  const remainingSessions = explicitRemainingSessions
    ? parseNumber(explicitRemainingSessions)
    : totalSessions;

  const usedSessions = Math.max(totalSessions - remainingSessions, 0);

  const packageName = getValue(row, [
    "Loại gói",
    "Loai goi",
    "Gói",
    "Goi",
    "Package",
    "Package Name",
    "package_name",
    "Plan Name",
    "plan_name",
  ]);

  const packageValue = parseMoney(
    getValue(row, [
      "Giá trị HĐ",
      "Gia tri HD",
      "Giá trị hợp đồng",
      "Gia tri hop dong",
      "Package Value",
      "package_value",
      "Price",
      "price",
    ])
  );

  const amountPaid = parseMoney(
    getValue(row, [
      "Đã thanh toán",
      "Da thanh toan",
      "Amount Paid",
      "amount_paid",
      "Paid",
    ])
  );

  const explicitBalanceDue = parseMoney(
    getValue(row, [
      "Công nợ còn lại",
      "Cong no con lai",
      "Công nợ",
      "Cong no",
      "Balance Due",
      "balance_due",
      "Debt",
    ])
  );

  const balanceDue =
    explicitBalanceDue !== null
      ? explicitBalanceDue
      : packageValue !== null && amountPaid !== null
      ? Math.max(packageValue - amountPaid, 0)
      : null;

  const purchaseType = normalizePurchaseType(
    getValue(row, [
      "Gói tập",
      "Goi tap",
      "Gói tập (New/renew)",
      "Goi tap New renew",
      "New/renew",
      "Purchase Type",
      "purchase_type",
    ])
  );

  const sourceResult = normalizeClientSource(
    getValue(row, [
      "Nguồn khách",
      "Nguon khach",
      "Client Source",
      "client_source",
      "Source",
    ])
  );

  const status = normalizeStatus(
    getValue(row, ["Trạng thái", "Trang thai", "Status", "status"]),
    remainingSessions
  );

  let error = "";

  if (!fullName) {
    error = "Missing client name.";
  } else if (totalSessions <= 0) {
    error = "Missing or invalid Số buổi.";
  } else if (remainingSessions < 0) {
    error = "Invalid Buổi còn lại.";
  } else if (remainingSessions > totalSessions) {
    error = "Buổi còn lại cannot be greater than Số buổi.";
  }

  return {
    rowNumber: index + 2,
    clientCode,
    fullName,
    email,
    phone,
    gender,
    dateOfBirth,
    purchaseDate,
    expireDate,
    totalSessions,
    remainingSessions,
    usedSessions,
    status,
    packageName,
    packageValue,
    amountPaid,
    balanceDue,
    purchaseType,
    clientSource: sourceResult.clientSource,
    clientSourceOther: sourceResult.clientSourceOther,
    error,
  };
}

async function readSpreadsheetFile(file: File): Promise<RawRow[]> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: false,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];

  return XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: "",
    raw: false,
  });
}

export default function ImportClientsPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState("Checking admin access...");
  const [rows, setRows] = useState<ParsedClientRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [pageMessage, setPageMessage] = useState("");

  const readyRows = rows.filter((row) => !row.error);
  const previewRows = rows.slice(0, 20);

  const summary = useMemo<ImportSummary>(() => {
    return {
      readyRows: rows.filter((row) => !row.error).length,
      errorRows: rows.filter((row) => row.error).length,
      totalSessions: rows.reduce((sum, row) => sum + row.totalSessions, 0),
      remainingSessions: rows.reduce((sum, row) => sum + row.remainingSessions, 0),
      totalDebt: rows.reduce((sum, row) => sum + (row.balanceDue || 0), 0),
    };
  }, [rows]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setRows([]);
    setImportResults([]);
    setPageMessage("");

    if (!file) return;

    setFileName(file.name);

    try {
      const rawRows = await readSpreadsheetFile(file);
      const parsedRows = rawRows
        .map((row, index) => parseRow(row, index))
        .filter((row) => {
          return (
            row.fullName ||
            row.clientCode ||
            row.totalSessions > 0 ||
            row.packageName ||
            row.packageValue !== null
          );
        });

      setRows(parsedRows);

      if (parsedRows.length === 0) {
        setPageMessage("No valid rows found in this file.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read spreadsheet file.";

      setPageMessage(message);
    }
  }

  async function findExistingClient(row: ParsedClientRow) {
    if (row.clientCode) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_code, full_name, email")
        .eq("client_code", row.clientCode)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) return data as ExistingClient;
    }

    if (row.email) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_code, full_name, email")
        .ilike("email", row.email)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) return data as ExistingClient;
    }

    const { data, error } = await supabase
      .from("clients")
      .select("id, client_code, full_name, email")
      .ilike("full_name", row.fullName)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data as ExistingClient | null;
  }

  async function upsertClient(row: ParsedClientRow) {
    const existingClient = await findExistingClient(row);

    const clientPayload = {
      client_code: row.clientCode || null,
      full_name: row.fullName,
      email: row.email || null,
      phone: row.phone || null,
      gender: row.gender || null,
      date_of_birth: row.dateOfBirth,
      status: row.status,
      client_source: row.clientSource,
      client_source_other: row.clientSourceOther,
    };

    if (existingClient) {
      const { data, error } = await supabase
        .from("clients")
        .update(clientPayload)
        .eq("id", existingClient.id)
        .select("id")
        .single();

      if (error) throw error;

      return data.id as string;
    }

    const { data, error } = await supabase
      .from("clients")
      .insert(clientPayload)
      .select("id")
      .single();

    if (error) throw error;

    return data.id as string;
  }

  async function upsertPackage(clientId: string, row: ParsedClientRow) {
    const packagePayload = {
      client_id: clientId,
      package_name: row.packageName || null,
      package_value: row.packageValue,
      total_sessions: row.totalSessions,
      used_sessions: row.usedSessions,
      remaining_sessions: row.remainingSessions,
      starts_at: row.purchaseDate,
      expires_at: row.expireDate,
      status: row.status === "active" && row.remainingSessions > 0 ? "active" : "completed",
    };

    const { data: existingPackage, error: existingPackageError } = await supabase
      .from("session_packages")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPackageError) throw existingPackageError;

    if (existingPackage?.id) {
      const { error } = await supabase
        .from("session_packages")
        .update(packagePayload)
        .eq("id", existingPackage.id);

      if (error) throw error;

      return;
    }

    const { error } = await supabase.from("session_packages").insert(packagePayload);

    if (error) throw error;
  }

  async function upsertPurchase(clientId: string, row: ParsedClientRow) {
    const purchasePayload = {
      client_id: clientId,
      plan_name: row.packageName || null,
      session_count: row.totalSessions,
      price: row.packageValue,
      amount_paid: row.amountPaid,
      balance_due: row.balanceDue,
      debt_deadline: row.balanceDue && row.balanceDue > 0 ? row.expireDate : null,
      purchase_type: row.purchaseType,
      status: "paid",
      created_at: row.purchaseDate || new Date().toISOString(),
    };

    const { data: existingPurchase, error: existingPurchaseError } = await supabase
      .from("client_purchases")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPurchaseError) throw existingPurchaseError;

    if (existingPurchase?.id) {
      const { error } = await supabase
        .from("client_purchases")
        .update(purchasePayload)
        .eq("id", existingPurchase.id);

      if (error) throw error;

      return;
    }

    const { error } = await supabase.from("client_purchases").insert(purchasePayload);

    if (error) throw error;
  }

  async function handleImport() {
    if (readyRows.length === 0) {
      setPageMessage("No ready rows to import.");
      return;
    }

    setImporting(true);
    setImportResults([]);
    setPageMessage("");

    const nextResults: ImportResult[] = [];

    for (const row of readyRows) {
      try {
        const clientId = await upsertClient(row);

        await upsertPackage(clientId, row);
        await upsertPurchase(clientId, row);

        nextResults.push({
          rowNumber: row.rowNumber,
          fullName: row.fullName,
          status: "success",
          message: "Imported successfully.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Import failed.";

        nextResults.push({
          rowNumber: row.rowNumber,
          fullName: row.fullName,
          status: "error",
          message,
        });
      }

      setImportResults([...nextResults]);
    }

    setImporting(false);
  }

  useEffect(() => {
    async function protectImportPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role === "admin") {
        setCheckingRole(false);
        return;
      }

      if (role === "manager") {
        setCheckingMessage("Managers can view data, but importing is admin-only.");
        router.push("/admin");
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

    protectImportPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-5 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-base font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="fxa-scrollbar min-h-screen overflow-y-auto bg-black p-3 text-white md:p-5">
      <style jsx global>{`
        html,
        body {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }

        ::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }

        ::-webkit-scrollbar-track {
          background: #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #facc15, #ca8a04);
          border: 3px solid #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fde047, #facc15);
        }

        .fxa-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }
      `}</style>

      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-[118rem]">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/55 p-5 shadow-2xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  Import Clients
                </h1>

                <p className="mt-2 max-w-3xl text-sm font-normal leading-6 text-gray-400">
                  Upload an Excel or CSV export. This page maps Số buổi to total
                  sessions, Buổi còn lại to remaining sessions, and Công nợ còn
                  lại to balance due.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/admin"
                  className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  Back to Admin
                </Link>

                <Link
                  href="/admin/clients"
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
                >
                  Client Directory
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-red-400 px-4 py-2 text-xs font-semibold uppercase text-red-300 transition hover:bg-red-400 hover:text-black"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <section className="mb-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
              <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                Rows Ready
              </p>
              <p className="mt-2 text-4xl font-semibold text-yellow-400">
                {summary.readyRows}
              </p>
            </div>

            <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-5 shadow-2xl">
              <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                Total Sessions
              </p>
              <p className="mt-2 text-4xl font-semibold text-cyan-300">
                {summary.totalSessions}
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-yellow-400/10 p-5 shadow-2xl">
              <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                Remaining Sessions
              </p>
              <p className="mt-2 text-4xl font-semibold text-yellow-300">
                {summary.remainingSessions}
              </p>
            </div>

            <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 shadow-2xl">
              <p className="text-xs font-normal uppercase tracking-widest text-gray-400">
                Debt
              </p>
              <p className="mt-2 text-4xl font-semibold text-red-300">
                {formatMoney(summary.totalDebt)}
              </p>
            </div>
          </section>

          <section className="mb-5 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl">
            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Upload File
                </p>

                <h2 className="mt-1 text-2xl font-semibold text-white">
                  Select Excel / CSV file
                </h2>

                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Supported headers include: Mã khách hàng, Ngày mua, Ngày hết
                  hạn, Tên khách hàng, Số buổi, Buổi còn lại, Trạng thái, Loại
                  gói, Giá trị HĐ, Đã thanh toán, Công nợ còn lại, Gói tập,
                  Nguồn khách.
                </p>

                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="mt-5 block w-full cursor-pointer rounded-2xl border border-yellow-500/30 bg-black/70 p-4 text-sm font-normal text-white file:mr-4 file:rounded-xl file:border-0 file:bg-yellow-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black hover:file:bg-yellow-300"
                />

                {fileName ? (
                  <p className="mt-3 text-sm font-normal text-yellow-300">
                    Selected: {fileName}
                  </p>
                ) : null}

                {pageMessage ? (
                  <p className="mt-4 rounded-2xl border border-orange-400/30 bg-orange-400/10 p-4 text-sm font-normal text-orange-200">
                    {pageMessage}
                  </p>
                ) : null}
              </div>

              <div className="rounded-3xl border border-yellow-400/20 bg-black/45 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Import Rules
                </p>

                <div className="mt-4 space-y-3 text-sm font-normal leading-6 text-gray-300">
                  <p>Số buổi → total_sessions</p>
                  <p>Buổi còn lại → remaining_sessions</p>
                  <p>Đã dùng → calculated from total - remaining</p>
                  <p>Công nợ còn lại → balance_due</p>
                  <p>Status uses active if sessions remain.</p>
                  <p>Managers cannot access this page. Admin only.</p>
                </div>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || readyRows.length === 0}
                  className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing ? "Importing..." : `Import ${readyRows.length} Ready Rows`}
                </button>
              </div>
            </div>
          </section>

          {rows.length > 0 ? (
            <section className="mb-5 overflow-hidden rounded-3xl border border-yellow-500/30 bg-black/65 shadow-2xl">
              <div className="border-b border-yellow-500/30 bg-black px-4 py-3">
                <p className="text-xs font-normal uppercase tracking-widest text-yellow-400">
                  Preview first {previewRows.length} rows of {rows.length}
                </p>
              </div>

              <div className="fxa-scrollbar overflow-x-auto">
                <table className="w-full min-w-[1680px] table-fixed border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-yellow-400 text-black">
                      <th className="w-[70px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Row
                      </th>
                      <th className="w-[115px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Mã KH
                      </th>
                      <th className="w-[115px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Ngày mua
                      </th>
                      <th className="w-[125px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Ngày hết hạn
                      </th>
                      <th className="w-[210px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Tên khách
                      </th>
                      <th className="w-[95px] border-r border-black/35 px-3 py-3 text-right text-xs font-semibold uppercase">
                        Số buổi
                      </th>
                      <th className="w-[115px] border-r border-black/35 px-3 py-3 text-right text-xs font-semibold uppercase">
                        Còn lại
                      </th>
                      <th className="w-[95px] border-r border-black/35 px-3 py-3 text-right text-xs font-semibold uppercase">
                        Đã dùng
                      </th>
                      <th className="w-[110px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Status
                      </th>
                      <th className="w-[230px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Loại gói
                      </th>
                      <th className="w-[120px] border-r border-black/35 px-3 py-3 text-right text-xs font-semibold uppercase">
                        Giá trị
                      </th>
                      <th className="w-[125px] border-r border-black/35 px-3 py-3 text-right text-xs font-semibold uppercase">
                        Đã trả
                      </th>
                      <th className="w-[125px] border-r border-black/35 px-3 py-3 text-right text-xs font-semibold uppercase">
                        Công nợ
                      </th>
                      <th className="w-[95px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Gói tập
                      </th>
                      <th className="w-[160px] border-r border-black/35 px-3 py-3 text-xs font-semibold uppercase">
                        Nguồn
                      </th>
                      <th className="w-[220px] px-3 py-3 text-xs font-semibold uppercase">
                        Error
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr
                        key={`${row.rowNumber}-${row.fullName}-${index}`}
                        className={`border-b border-white/10 ${
                          row.error
                            ? "bg-red-950/30"
                            : index % 2 === 0
                            ? "bg-[#101010]"
                            : "bg-[#171717]"
                        }`}
                      >
                        <td className="border-r border-white/15 px-3 py-3 text-gray-400">
                          {row.rowNumber}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-yellow-300">
                          {row.clientCode || "-"}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-gray-200">
                          {formatDate(row.purchaseDate)}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-gray-200">
                          {formatDate(row.expireDate)}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-white">
                          <span className="block truncate">{row.fullName || "-"}</span>
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-right text-cyan-300">
                          {row.totalSessions}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-right text-yellow-300">
                          {row.remainingSessions}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-right text-blue-300">
                          {row.usedSessions}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-gray-200">
                          {row.status}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-gray-200">
                          <span className="block truncate">{row.packageName || "-"}</span>
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-right text-green-300">
                          {formatMoney(row.packageValue)}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-right text-green-300">
                          {formatMoney(row.amountPaid)}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-right text-red-300">
                          {formatMoney(row.balanceDue)}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-gray-200">
                          {row.purchaseType}
                        </td>
                        <td className="border-r border-white/15 px-3 py-3 text-gray-200">
                          {row.clientSourceOther || row.clientSource || "-"}
                        </td>
                        <td className="px-3 py-3 text-red-300">
                          {row.error || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {importResults.length > 0 ? (
            <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                Import Results
              </p>

              <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-2">
                {importResults.map((result) => (
                  <div
                    key={`${result.rowNumber}-${result.fullName}`}
                    className={`rounded-2xl border p-4 ${
                      result.status === "success"
                        ? "border-green-400/30 bg-green-400/10 text-green-200"
                        : "border-red-400/30 bg-red-400/10 text-red-200"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      Row {result.rowNumber}: {result.fullName}
                    </p>
                    <p className="mt-1 text-sm font-normal">{result.message}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}