"use client";

import { ChangeEvent, useEffect, useState } from "react";
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
  remainingSessions: number;
  packageName: string;
  packageValue: number | null;
  status: "active" | "inactive";
  email: string;
  phone: string;
  gender: string;
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
    const day = Number(slashParts[0]);
    const month = Number(slashParts[1]);
    const year = Number(slashParts[2]);

    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      const date = new Date(year, month - 1, day, 12, 0, 0);
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

      const date = new Date(third, second - 1, first, 12, 0, 0);
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

  const remainingSessions = cleanNumber(
    getCell(row, ["Số buổi", "So buoi", "remaining_sessions"]),
    0
  );

  const packageName = normalizePackageName(
    cleanText(getCell(row, ["Loại gói", "Loai goi", "package_name"]))
  );

  const packageValueRaw = getCell(row, [
    "Giá trị hợp đồng",
    "Gia tri hop dong",
    "Giá trị hợ đồng",
    "package_value",
  ]);

  const packageValue =
    packageValueRaw === "" ||
    packageValueRaw === null ||
    packageValueRaw === undefined
      ? null
      : cleanNumber(packageValueRaw, 0);

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

  return {
    clientCode,
    fullName,
    purchaseDate,
    expireDate,
    remainingSessions,
    packageName,
    packageValue,
    status,
    email,
    phone,
    gender,
  };
}

export default function ImportClientsPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

    const packageStatus = row.status === "active" ? "active" : "completed";

    const packagePayload = {
      client_id: clientId,
      package_name: row.packageName || null,
      package_value: row.packageValue,
      total_sessions: null,
      used_sessions: 0,
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
  session_count: row.remainingSessions,
  price: row.packageValue,
  status: "paid",
  created_at: row.purchaseDate,
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
          status: row.status === "active" ? "active" : "inactive",
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
        <p className="font-black text-yellow-400">Checking admin access...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="mt-2 text-4xl font-black text-white md:text-6xl">
                Import Excel
              </h1>

              <p className="mt-3 text-gray-400">
                Import Mã khách hàng, Ngày mua, Ngày hết hạn, Tên khách hàng,
                Số buổi còn lại, Loại gói, Giá trị hợp đồng, Email, Số điện
                thoại, and Giới tính.
              </p>
            </div>

            <Link
              href="/admin/clients"
              className="rounded-xl bg-yellow-400 px-5 py-3 text-center font-black uppercase text-black transition hover:bg-yellow-300"
            >
              Back To Clients
            </Link>
          </div>

          <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-white">
                Upload Excel File
              </h2>

              <p className="mt-2 text-sm text-gray-400">
                This importer reads: Mã khách hàng, Ngày mua, Ngày hết hạn, Tên
                khách hàng, Số buổi, Loại gói, Giá trị hợp đồng, Email, Số điện
                thoại, Giới tính, and Trạng thái.
              </p>

              <p className="mt-2 text-sm font-bold text-yellow-300">
                Important: Số buổi is saved as remaining sessions. Total
                sessions is saved blank.
              </p>
            </div>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="w-full rounded-xl border border-white/20 bg-black/50 p-3 font-bold text-white file:mr-4 file:rounded-xl file:border-0 file:bg-yellow-400 file:px-4 file:py-2 file:font-black file:text-black hover:file:bg-yellow-300"
            />

            <button
              type="button"
              onClick={importRows}
              disabled={importing || rows.length === 0}
              className="mt-5 w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? "Importing..." : `Import ${rows.length} Rows`}
            </button>

            {resultMessage ? (
              <p className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 font-bold text-yellow-300">
                {resultMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <pre className="mt-5 whitespace-pre-wrap rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                {errorMessage}
              </pre>
            ) : null}
          </section>

          {rows.length > 0 ? (
            <section className="mt-8 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
              <h2 className="mb-5 text-2xl font-black text-white">
                Preview First 20 Rows
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1300px] border-collapse">
                  <thead>
                    <tr className="border-b border-yellow-500/30 text-left text-sm uppercase tracking-wide text-yellow-400">
                      <th className="p-3">Mã khách hàng</th>
                      <th className="p-3">Date of Purchase</th>
                      <th className="p-3">Date Expire</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Remaining Sessions</th>
                      <th className="p-3">Total Sessions</th>
                      <th className="p-3">Package Type</th>
                      <th className="p-3">Package Value</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Gender</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.slice(0, 20).map((row, index) => (
                      <tr
                        key={`${row.clientCode}-${row.fullName}-${index}`}
                        className="border-b border-white/10"
                      >
                        <td className="p-3 text-gray-300">
                          {row.clientCode || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {formatDate(row.purchaseDate)}
                        </td>

                        <td className="p-3 text-gray-300">
                          {formatDate(row.expireDate)}
                        </td>

                        <td className="p-3 font-bold text-white">
                          {row.fullName || "-"}
                        </td>

                        <td className="p-3 font-black text-yellow-400">
                          {row.remainingSessions}
                        </td>

                        <td className="p-3 text-gray-300">-</td>

                        <td className="p-3 text-gray-300">
                          {row.packageName || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.packageValue === null
                            ? "-"
                            : `$${Number(row.packageValue).toFixed(2)}`}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.email || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.phone || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.gender || "-"}
                        </td>

                        <td className="p-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                              row.status === "active"
                                ? "bg-green-200 text-green-900"
                                : "bg-red-200 text-red-900"
                            }`}
                          >
                            {row.status}
                          </span>
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