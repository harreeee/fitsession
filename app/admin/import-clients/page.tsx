"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type ExcelClientRow = {
  "Tên Khách hàng"?: string;
  "Ngày mua"?: string | number;
  "Ngày hết hạn"?: string | number;
  "Số buổi"?: string | number;
  "Loại gói"?: string;
  "Giá trị hợp đồng"?: string | number;
  "Trạng thái"?: string;

  full_name?: string;
  purchase_date?: string | number;
  expires_at?: string | number;
  total_sessions?: string | number;
  package_name?: string;
  package_value?: string | number;
  status?: string;
};

type PreviewRow = {
  fullName: string;
  purchaseDate: string | null;
  expireDate: string | null;
  totalSessions: number;
  packageName: string;
  packageValue: number | null;
  status: string;
};

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
    return value.toISOString();
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

  const parts = textValue.split("/");

  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);

    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      const date = new Date(year, month - 1, day, 12, 0, 0);
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

function normalizeStatus(value: string) {
  const status = value.trim().toLowerCase();

  if (!status) return "active";

  if (status.includes("đang") || status.includes("dang")) return "active";
  if (status.includes("hết") || status.includes("het")) return "inactive";
  if (status.includes("expired")) return "inactive";
  if (status.includes("inactive")) return "inactive";
  if (status.includes("completed")) return "completed";

  return "active";
}

function normalizePackageName(value: string) {
  const packageName = value.trim();

  if (!packageName) return null;

  return packageName;
}

function getRowValue(row: ExcelClientRow, vietnameseKey: keyof ExcelClientRow, englishKey: keyof ExcelClientRow) {
  return row[vietnameseKey] || row[englishKey] || "";
}

function mapExcelRow(row: ExcelClientRow): PreviewRow {
  const fullName = cleanText(
    getRowValue(row, "Tên Khách hàng", "full_name")
  );

  const purchaseDate = cleanDate(
    getRowValue(row, "Ngày mua", "purchase_date")
  );

  const expireDate = cleanDate(
    getRowValue(row, "Ngày hết hạn", "expires_at")
  );

  const totalSessions = cleanNumber(
    getRowValue(row, "Số buổi", "total_sessions"),
    0
  );

  const packageName =
    normalizePackageName(
      cleanText(getRowValue(row, "Loại gói", "package_name"))
    ) || "";

  const packageValueRaw = getRowValue(
    row,
    "Giá trị hợp đồng",
    "package_value"
  );

  const packageValue =
    packageValueRaw === "" || packageValueRaw === null || packageValueRaw === undefined
      ? null
      : cleanNumber(packageValueRaw, 0);

  const status = normalizeStatus(
    cleanText(getRowValue(row, "Trạng thái", "status"))
  );

  return {
    fullName,
    purchaseDate,
    expireDate,
    totalSessions,
    packageName,
    packageValue,
    status,
  };
}

export default function ImportClientsPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

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

      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setRows([]);
    setResultMessage("");

    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const parsedRows = XLSX.utils.sheet_to_json<ExcelClientRow>(worksheet, {
      defval: "",
      raw: true,
    });

    const mappedRows = parsedRows
      .map(mapExcelRow)
      .filter((row) => row.fullName || row.totalSessions > 0 || row.packageName);

    setRows(mappedRows);
  }

  async function importRows() {
    if (rows.length === 0) {
      alert("Upload an Excel file first.");
      return;
    }

    const confirmed = window.confirm(
      `Import ${rows.length} rows? Existing clients will be matched by client name.`
    );

    if (!confirmed) return;

    setImporting(true);
    setResultMessage("");

    let createdClients = 0;
    let updatedClients = 0;
    let skippedRows = 0;

    for (const row of rows) {
      if (!row.fullName) {
        skippedRows += 1;
        continue;
      }

      const { data: existingClients, error: searchError } = await supabase
        .from("clients")
        .select("id, full_name, status")
        .ilike("full_name", row.fullName);

      if (searchError) {
        console.error(searchError);
        skippedRows += 1;
        continue;
      }

      const existingClient = existingClients?.[0] || null;

      let clientId = "";

      if (existingClient) {
        const { error: updateClientError } = await supabase
          .from("clients")
          .update({
            full_name: row.fullName,
            status: row.status === "active" ? "active" : "inactive",
          })
          .eq("id", existingClient.id);

        if (updateClientError) {
          console.error(updateClientError);
          skippedRows += 1;
          continue;
        }

        clientId = existingClient.id;
        updatedClients += 1;
      } else {
        const qrToken = `FXA-${crypto.randomUUID()}`;

        const { data: newClient, error: createClientError } = await supabase
          .from("clients")
          .insert({
            full_name: row.fullName,
            email: null,
            phone: null,
            qr_token: qrToken,
            status: row.status === "active" ? "active" : "inactive",
          })
          .select("id")
          .single();

        if (createClientError || !newClient) {
          console.error(createClientError);
          skippedRows += 1;
          continue;
        }

        clientId = newClient.id;
        createdClients += 1;
      }

      if (!clientId || row.totalSessions <= 0) {
        continue;
      }

      const { data: activePackage, error: packageSearchError } = await supabase
        .from("session_packages")
        .select("id")
        .eq("client_id", clientId)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (packageSearchError) {
        console.error(packageSearchError);
        skippedRows += 1;
        continue;
      }

      const packageStatus = row.status === "active" ? "active" : "completed";

      if (activePackage) {
        const { error: updatePackageError } = await supabase
          .from("session_packages")
          .update({
            package_name: row.packageName || null,
            package_value: row.packageValue,
            total_sessions: row.totalSessions,
            used_sessions: 0,
            remaining_sessions: row.totalSessions,
            starts_at: row.purchaseDate,
            expires_at: row.expireDate,
            status: packageStatus,
          })
          .eq("id", activePackage.id);

        if (updatePackageError) {
          console.error(updatePackageError);
          skippedRows += 1;
          continue;
        }
      } else {
        const { error: createPackageError } = await supabase
          .from("session_packages")
          .insert({
            client_id: clientId,
            package_name: row.packageName || null,
            package_value: row.packageValue,
            total_sessions: row.totalSessions,
            used_sessions: 0,
            remaining_sessions: row.totalSessions,
            starts_at: row.purchaseDate,
            expires_at: row.expireDate,
            status: packageStatus,
          });

        if (createPackageError) {
          console.error(createPackageError);
          skippedRows += 1;
          continue;
        }
      }
    }

    setResultMessage(
      `Import finished. Created: ${createdClients}. Updated: ${updatedClients}. Skipped: ${skippedRows}.`
    );

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
                Import only the fields shown on your Manage Clients page.
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
                This importer reads: Tên Khách hàng, Ngày mua, Ngày hết hạn, Số
                buổi, Loại gói, Giá trị hợp đồng, and Trạng thái.
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
          </section>

          {rows.length > 0 ? (
            <section className="mt-8 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
              <h2 className="mb-5 text-2xl font-black text-white">
                Preview First 20 Rows
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse">
                  <thead>
                    <tr className="border-b border-yellow-500/30 text-left text-sm uppercase tracking-wide text-yellow-400">
                      <th className="p-3">Date of Purchase</th>
                      <th className="p-3">Date Expire</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Total Session</th>
                      <th className="p-3">Package Type</th>
                      <th className="p-3">Package Value</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.slice(0, 20).map((row, index) => (
                      <tr
                        key={`${row.fullName}-${index}`}
                        className="border-b border-white/10"
                      >
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
                          {row.totalSessions}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.packageName || "-"}
                        </td>

                        <td className="p-3 text-gray-300">
                          {row.packageValue === null
                            ? "-"
                            : `$${Number(row.packageValue).toFixed(2)}`}
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