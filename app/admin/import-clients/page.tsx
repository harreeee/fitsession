"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ExcelCellValue = string | number | boolean | Date | null | undefined;

type ExcelClientRow = Record<string, ExcelCellValue>;

type PreviewRow = {
  clientCode: string;
  fullName: string;
  purchaseDate: string | null;
  expireDate: string | null;
  totalSessions: number;
  remainingSessions: number;
  usedSessions: number;
  packageName: string;
  packageValue: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  purchaseType: string | null;
  status: "active" | "inactive";
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string | null;
  clientSource: string | null;
  clientSourceOther: string | null;
};

type ExistingClientRow = {
  id: string;
  full_name: string;
  client_code: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
};

type ExistingPackageRow = {
  id: string;
};

type ExistingPurchaseRow = {
  id: string;
};

type ImportErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function getCell(row: ExcelClientRow, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeKey(key))) {
      return value;
    }
  }

  return "";
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    const numberValue = Number(cleaned);
    return Number.isNaN(numberValue) ? fallback : numberValue;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? fallback : numberValue;
}

function cleanNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    const numberValue = Number(cleaned);
    return Number.isNaN(numberValue) ? null : numberValue;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function cleanDate(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) {
    const date = new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12,
      0,
      0
    );

    return date.toISOString();
  }

  if (typeof value === "number") {
    const parsedDate = XLSX.SSF.parse_date_code(value);

    if (!parsedDate) return null;

    const date = new Date(
      parsedDate.y,
      parsedDate.m - 1,
      parsedDate.d,
      12,
      0,
      0
    );

    return date.toISOString();
  }

  const textValue = String(value).trim();

  if (!textValue) return null;

  const slashParts = textValue.split("/");

  if (slashParts.length === 3) {
    const first = Number(slashParts[0]);
    const second = Number(slashParts[1]);
    const third = Number(slashParts[2]);

    if (!Number.isNaN(first) && !Number.isNaN(second) && !Number.isNaN(third)) {
      const year = third < 100 ? 2000 + third : third;
      const date = new Date(year, second - 1, first, 12, 0, 0);
      return date.toISOString();
    }
  }

  const dashParts = textValue.split("-");

  if (dashParts.length === 3) {
    const first = Number(dashParts[0]);
    const second = Number(dashParts[1]);
    const third = Number(dashParts[2]);

    if (!Number.isNaN(first) && !Number.isNaN(second) && !Number.isNaN(third)) {
      if (String(dashParts[0]).length === 4) {
        const date = new Date(first, second - 1, third, 12, 0, 0);
        return date.toISOString();
      }

      const year = third < 100 ? 2000 + third : third;
      const date = new Date(year, second - 1, first, 12, 0, 0);
      return date.toISOString();
    }
  }

  const date = new Date(textValue);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "-";

  return `$${Number(value).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeStatus(value: string): "active" | "inactive" {
  const status = value.trim().toLowerCase();

  if (!status) return "active";

  if (status.includes("đang") || status.includes("dang")) return "active";
  if (status.includes("active")) return "active";

  if (status.includes("hết") || status.includes("het")) return "inactive";
  if (status.includes("expired")) return "inactive";
  if (status.includes("inactive")) return "inactive";
  if (status.includes("completed")) return "inactive";

  return "active";
}

function normalizeGender(value: string) {
  const gender = value.trim();

  if (!gender) return "";

  const lowerGender = gender.toLowerCase();

  if (lowerGender === "nam" || lowerGender === "male") return "Nam";

  if (
    lowerGender === "nữ" ||
    lowerGender === "nu" ||
    lowerGender === "female"
  ) {
    return "Nữ";
  }

  return gender;
}

function normalizePackageName(value: string) {
  const packageName = value.trim();

  if (!packageName) return "";

  return packageName;
}

function normalizePurchaseType(value: string) {
  const cleanValue = value.trim().toLowerCase();

  if (!cleanValue) return null;
  if (cleanValue.includes("renew")) return "renew";
  if (cleanValue.includes("new")) return "new";

  return cleanValue;
}

function normalizeClientSource(value: string) {
  const source = value.trim();

  if (!source) {
    return {
      clientSource: null,
      clientSourceOther: null,
    };
  }

  const lowerSource = source.toLowerCase();

  if (lowerSource.includes("google")) {
    return {
      clientSource: "google",
      clientSourceOther: null,
    };
  }

  if (lowerSource.includes("facebook")) {
    return {
      clientSource: "facebook",
      clientSourceOther: null,
    };
  }

  if (lowerSource.includes("instagram")) {
    return {
      clientSource: "instagram",
      clientSourceOther: null,
    };
  }

  if (lowerSource.includes("walk")) {
    return {
      clientSource: "direct_lead_walk_in",
      clientSourceOther: null,
    };
  }

  if (
    lowerSource.includes("refer") ||
    lowerSource.includes("referral") ||
    lowerSource.includes("giới thiệu") ||
    lowerSource.includes("gioi thieu")
  ) {
    return {
      clientSource: "referral_lead",
      clientSourceOther: source,
    };
  }

  if (lowerSource.includes("coach")) {
    return {
      clientSource: "coach",
      clientSourceOther: source,
    };
  }

  return {
    clientSource: "other",
    clientSourceOther: source,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const errorLike = error as ImportErrorLike;

    const parts = [
      errorLike.message,
      errorLike.details,
      errorLike.hint,
      errorLike.code,
    ]
      .filter((part) => part !== null && part !== undefined && part !== "")
      .map(String);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown import error.";
  }
}

function mapExcelRow(row: ExcelClientRow): PreviewRow {
  const clientCode = cleanText(
    getCell(row, [
      "Mã Khách hàng",
      "Mã khách hàng",
      "Ma Khach hang",
      "client_code",
    ])
  );

  const fullName = cleanText(
    getCell(row, [
      "Tên Khách hàng",
      "Tên khách hàng",
      "Ten Khach hang",
      "full_name",
    ])
  );

  const purchaseDate = cleanDate(
    getCell(row, ["Ngày mua", "Ngay mua", "purchase_date"])
  );

  const expireDate = cleanDate(
    getCell(row, [
      "Ngày hết hạn",
      "Ngay het han",
      "expires_at",
      "expire_date",
    ])
  );

  const totalSessions = cleanNumber(
    getCell(row, ["Số buổi", "So buoi", "total_sessions"]),
    0
  );

  const remainingSessions = cleanNumber(
    getCell(row, [
      "Buổi còn lại",
      "Buoi con lai",
      "Số buổi còn lại",
      "So buoi con lai",
      "remaining_sessions",
    ]),
    totalSessions
  );

  const usedSessions = Math.max(totalSessions - remainingSessions, 0);

  const packageName = normalizePackageName(
    cleanText(getCell(row, ["Loại gói", "Loai goi", "package_name"]))
  );

  const packageValue = cleanNullableNumber(
    getCell(row, [
      "Giá trị hợp đồng",
      "Gia tri hop dong",
      "Giá trị hợ đồng",
      "package_value",
    ])
  );

  const amountPaid = cleanNullableNumber(
    getCell(row, [
      "Đã thanh toán",
      "Da thanh toán",
      "Da thanh toan",
      "amount_paid",
    ])
  );

  const explicitBalanceDue = cleanNullableNumber(
    getCell(row, [
      "Công nợ còn lại",
      "Cong no con lai",
      "Công nợ",
      "Cong no",
      "balance_due",
    ])
  );

  const balanceDue =
    explicitBalanceDue !== null
      ? explicitBalanceDue
      : packageValue !== null && amountPaid !== null
      ? Math.max(packageValue - amountPaid, 0)
      : null;

  const purchaseType = normalizePurchaseType(
    cleanText(
      getCell(row, [
        "Gói tập (New/renew)",
        "Gói tập",
        "Goi tap",
        "New/renew",
        "New renew",
        "purchase_type",
      ])
    )
  );

  const status = normalizeStatus(
    cleanText(getCell(row, ["Trạng thái", "Trang thai", "status"]))
  );

  const email = cleanText(getCell(row, ["Email", "email"]));

  const phone = cleanText(
    getCell(row, ["Số điện thoại", "So dien thoai", "Phone", "phone"])
  );

  const gender = normalizeGender(
    cleanText(getCell(row, ["Giới tính", "Gioi tinh", "Gender", "gender"]))
  );

  const dateOfBirth = cleanDate(
    getCell(row, [
      "Ngày tháng năm sinh",
      "Ngay thang nam sinh",
      "Năm tháng năm sinh",
      "Nam thang nam sinh",
      "date_of_birth",
    ])
  );

  const sourceResult = normalizeClientSource(
    cleanText(
      getCell(row, [
        "Nguồn khách",
        "Nguon khach",
        "Nguồn",
        "Nguon",
        "client_source",
      ])
    )
  );

  return {
    clientCode,
    fullName,
    purchaseDate,
    expireDate,
    totalSessions,
    remainingSessions,
    usedSessions,
    packageName,
    packageValue,
    amountPaid,
    balanceDue,
    purchaseType,
    status,
    email,
    phone,
    gender,
    dateOfBirth,
    clientSource: sourceResult.clientSource,
    clientSourceOther: sourceResult.clientSourceOther,
  };
}

export default function ImportClientsPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const importSummary = useMemo(() => {
    const totalClients = rows.length;
    const totalSessions = rows.reduce((sum, row) => sum + row.totalSessions, 0);
    const remainingSessions = rows.reduce(
      (sum, row) => sum + row.remainingSessions,
      0
    );
    const totalDebt = rows.reduce((sum, row) => sum + (row.balanceDue || 0), 0);

    return {
      totalClients,
      totalSessions,
      remainingSessions,
      totalDebt,
    };
  }, [rows]);

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
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
        return;
      }

      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setRows([]);
    setResultMessage("");
    setErrorMessage("");

    if (!file) return;

    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
    });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const parsedRows = XLSX.utils.sheet_to_json<ExcelClientRow>(worksheet, {
      defval: "",
      raw: true,
    });

    const mappedRows = parsedRows
      .map(mapExcelRow)
      .filter((row) => {
        return (
          row.clientCode ||
          row.fullName ||
          row.email ||
          row.phone ||
          row.totalSessions > 0 ||
          row.remainingSessions > 0 ||
          row.packageName
        );
      });

    setRows(mappedRows);
  }

  async function findExistingClient(row: PreviewRow) {
    if (row.clientCode) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, client_code, email, phone, status")
        .eq("client_code", row.clientCode)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data as ExistingClientRow;
      }

      if (error) {
        console.warn("Client code search failed:", error.message);
      }
    }

    if (row.email) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, client_code, email, phone, status")
        .ilike("email", row.email)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data as ExistingClientRow;
      }

      if (error) {
        console.warn("Email search failed:", error.message);
      }
    }

    if (row.fullName) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, client_code, email, phone, status")
        .ilike("full_name", row.fullName)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data as ExistingClientRow;
      }

      if (error) {
        console.warn("Name search failed:", error.message);
      }
    }

    return null;
  }

  async function upsertPackage(clientId: string, row: PreviewRow) {
    const { data: latestPackage, error: packageSearchError } = await supabase
      .from("session_packages")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (packageSearchError) {
      throw packageSearchError;
    }

    const packageStatus =
      row.status === "active" && row.remainingSessions > 0
        ? "active"
        : "completed";

    const packagePayload = {
      client_id: clientId,
      package_name: row.packageName || null,
      package_value: row.packageValue,
      total_sessions: row.totalSessions,
      used_sessions: row.usedSessions,
      remaining_sessions: row.remainingSessions,
      starts_at: row.purchaseDate,
      expires_at: row.expireDate,
      status: packageStatus,
    };

    if (latestPackage) {
      const packageRow = latestPackage as ExistingPackageRow;

      const { error: updatePackageError } = await supabase
        .from("session_packages")
        .update(packagePayload)
        .eq("id", packageRow.id);

      if (updatePackageError) {
        throw updatePackageError;
      }

      return;
    }

    const { error: createPackageError } = await supabase
      .from("session_packages")
      .insert(packagePayload);

    if (createPackageError) {
      throw createPackageError;
    }
  }

  async function upsertPurchase(clientId: string, row: PreviewRow) {
    const { data: latestPurchase, error: purchaseSearchError } = await supabase
      .from("client_purchases")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (purchaseSearchError) {
      throw purchaseSearchError;
    }

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

    if (latestPurchase) {
      const purchaseRow = latestPurchase as ExistingPurchaseRow;

      const { error: updatePurchaseError } = await supabase
        .from("client_purchases")
        .update(purchasePayload)
        .eq("id", purchaseRow.id);

      if (updatePurchaseError) {
        throw updatePurchaseError;
      }

      return;
    }

    const { error: createPurchaseError } = await supabase
      .from("client_purchases")
      .insert(purchasePayload);

    if (createPurchaseError) {
      throw createPurchaseError;
    }
  }

  async function importRows() {
    if (rows.length === 0) {
      alert("Upload an Excel file first.");
      return;
    }

    const confirmed = window.confirm(
      `Import ${rows.length} rows? Existing clients will be matched by Mã khách hàng, then email, then client name.`
    );

    if (!confirmed) return;

    setImporting(true);
    setResultMessage("");
    setErrorMessage("");

    let createdClients = 0;
    let updatedClients = 0;
    let skippedRows = 0;
    const failedMessages: string[] = [];

    for (const row of rows) {
      if (!row.fullName) {
        skippedRows += 1;
        failedMessages.push("Skipped row with missing client name.");
        continue;
      }

      try {
        const existingClient = await findExistingClient(row);

        let clientId = "";

        const clientPayload = {
          client_code: row.clientCode || null,
          full_name: row.fullName,
          email: row.email || null,
          phone: row.phone || null,
          gender: row.gender || null,
          date_of_birth: row.dateOfBirth,
          status: row.status === "active" ? "active" : "inactive",
          client_source: row.clientSource,
          client_source_other: row.clientSourceOther,
        };

        if (existingClient) {
          const { error: updateClientError } = await supabase
            .from("clients")
            .update(clientPayload)
            .eq("id", existingClient.id);

          if (updateClientError) {
            throw updateClientError;
          }

          clientId = existingClient.id;
          updatedClients += 1;
        } else {
          const qrToken = `FXA-${crypto.randomUUID()}`;

          const { data: newClient, error: createClientError } = await supabase
            .from("clients")
            .insert({
              ...clientPayload,
              qr_token: qrToken,
            })
            .select("id")
            .single();

          if (createClientError || !newClient) {
            throw createClientError || new Error("Client was not created.");
          }

          clientId = newClient.id;
          createdClients += 1;
        }

        if (!clientId) {
          skippedRows += 1;
          failedMessages.push(`Skipped ${row.fullName}: missing client ID.`);
          continue;
        }

        await upsertPackage(clientId, row);
        await upsertPurchase(clientId, row);
      } catch (error) {
        const message = getErrorMessage(error);

        console.error("Import row failed:", {
          row,
          error,
          message,
        });

        skippedRows += 1;
        failedMessages.push(`${row.fullName}: ${message}`);
      }
    }

    setResultMessage(
      `Import finished. Created: ${createdClients}. Updated: ${updatedClients}. Skipped: ${skippedRows}.`
    );

    if (failedMessages.length > 0) {
      setErrorMessage(failedMessages.slice(0, 8).join("\n"));
    }

    setImporting(false);
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <p className="text-sm font-semibold text-yellow-400">
          Checking admin access...
        </p>
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
        <div className="mx-auto max-w-7xl">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  Import Excel
                </h1>

                <p className="mt-2 max-w-3xl text-sm font-normal leading-6 text-gray-400">
                  Import client sessions, remaining sessions, package value, paid
                  amount, and remaining debt from your Google Sheet export.
                </p>
              </div>

              <Link
                href="/admin/clients"
                className="rounded-xl bg-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-black transition hover:bg-yellow-300"
              >
                Back To Clients
              </Link>
            </div>
          </header>

          <section className="mb-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Rows Ready
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-400">
                {importSummary.totalClients}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Total Sessions
              </p>
              <p className="mt-1 text-3xl font-semibold text-cyan-300">
                {importSummary.totalSessions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Remaining Sessions
              </p>
              <p className="mt-1 text-3xl font-semibold text-yellow-300">
                {importSummary.remainingSessions}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-normal uppercase text-gray-400">
                Debt
              </p>
              <p className="mt-1 text-3xl font-semibold text-red-300">
                {formatMoney(importSummary.totalDebt)}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                Upload File
              </p>

              <h2 className="mt-1 text-2xl font-semibold text-white">
                Upload Excel File
              </h2>

              <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                Correct mapping: Số buổi → total sessions, Buổi còn lại →
                remaining sessions, Công nợ còn lại → balance due.
              </p>
            </div>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-sm font-semibold text-white file:mr-4 file:rounded-xl file:border-0 file:bg-yellow-400 file:px-4 file:py-2 file:font-semibold file:text-black hover:file:bg-yellow-300"
            />

            <button
              type="button"
              onClick={importRows}
              disabled={importing || rows.length === 0}
              className="mt-5 w-full rounded-xl bg-yellow-400 p-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? "Importing..." : `Import ${rows.length} Rows`}
            </button>

            {resultMessage ? (
              <p className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm font-normal text-yellow-100">
                {resultMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <pre className="mt-5 whitespace-pre-wrap rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-normal text-red-200">
                {errorMessage}
              </pre>
            ) : null}
          </section>

          {rows.length > 0 ? (
            <section className="mt-5 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                    Preview
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    Preview First 20 Rows
                  </h2>
                </div>

                <p className="text-sm font-normal text-gray-400">
                  Showing {Math.min(rows.length, 20)} of {rows.length} rows.
                </p>
              </div>

              <div className="fxa-scrollbar overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[1650px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-yellow-400 text-black">
                      <th className="p-3 font-semibold uppercase">Mã KH</th>
                      <th className="p-3 font-semibold uppercase">Ngày mua</th>
                      <th className="p-3 font-semibold uppercase">Ngày hết hạn</th>
                      <th className="p-3 font-semibold uppercase">Tên khách</th>
                      <th className="p-3 text-right font-semibold uppercase">
                        Số buổi
                      </th>
                      <th className="p-3 text-right font-semibold uppercase">
                        Buổi còn lại
                      </th>
                      <th className="p-3 text-right font-semibold uppercase">
                        Đã dùng
                      </th>
                      <th className="p-3 font-semibold uppercase">Trạng thái</th>
                      <th className="p-3 font-semibold uppercase">Loại gói</th>
                      <th className="p-3 text-right font-semibold uppercase">
                        Giá trị HĐ
                      </th>
                      <th className="p-3 text-right font-semibold uppercase">
                        Đã thanh toán
                      </th>
                      <th className="p-3 text-right font-semibold uppercase">
                        Công nợ
                      </th>
                      <th className="p-3 font-semibold uppercase">Gói tập</th>
                      <th className="p-3 font-semibold uppercase">Nguồn</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.slice(0, 20).map((row, index) => (
                      <tr
                        key={`${row.clientCode}-${row.fullName}-${index}`}
                        className={`border-b border-white/10 ${
                          index % 2 === 0 ? "bg-[#101010]" : "bg-[#171717]"
                        }`}
                      >
                        <td className="p-3 text-yellow-300">
                          {row.clientCode || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {formatDate(row.purchaseDate)}
                        </td>

                        <td className="p-3 text-gray-300">
                          {formatDate(row.expireDate)}
                        </td>

                        <td className="p-3 font-semibold text-white">
                          {row.fullName || "-"}
                        </td>

                        <td className="p-3 text-right font-semibold text-cyan-300">
                          {row.totalSessions}
                        </td>

                        <td className="p-3 text-right font-semibold text-yellow-300">
                          {row.remainingSessions}
                        </td>

                        <td className="p-3 text-right font-semibold text-blue-300">
                          {row.usedSessions}
                        </td>

                        <td className="p-3">
                          <span
                            className={`rounded-md border px-2 py-1 text-xs font-normal uppercase ${
                              row.status === "active"
                                ? "border-green-400/40 bg-green-400/10 text-green-300"
                                : "border-red-400/40 bg-red-400/10 text-red-300"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.packageName || "-"}
                        </td>

                        <td className="p-3 text-right text-green-300">
                          {formatMoney(row.packageValue)}
                        </td>

                        <td className="p-3 text-right text-green-300">
                          {formatMoney(row.amountPaid)}
                        </td>

                        <td className="p-3 text-right text-red-300">
                          {formatMoney(row.balanceDue)}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.purchaseType || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.clientSourceOther || row.clientSource || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}