import { createServiceSupabaseClient, getUserFromRequest } from "./supabaseServer";
import { generateAiText } from "./aiProvider";

export type SummaryLanguage = "en" | "vi";
export type Priority = "high" | "medium" | "low";
export type AttendanceCounts = {
  completed: number;
  noShow: number;
  lateCancel: number;
  cancelled: number;
  failed: number;
};

export type ClientSummaryItem = {
  clientId: string;
  clientCode: string | null;
  clientName: string;
  clientStatus: string | null;
  assignedTrainer: string | null;
  assignedNutritionCoach: string | null;
  summary: string;
  priority: Priority;
  needsAttention: boolean;
  lowSessions: boolean;
  missingNotes: boolean;
  poorAttendance: boolean;
  documentedConcernMentions: number;
  remainingSessions: number | null;
  recordsReviewed: number;
  notesReviewed: number;
  latestSessionAt: string | null;
  counts: AttendanceCounts;
  aiError: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
};

const COMPLETED = new Set(["success", "completed"]);
const CONCERNS = [
  "pain", "hurt", "injury", "injured", "discomfort", "sore", "dizzy", "nausea", "swelling", "limited mobility",
  "đau", "chấn thương", "khó chịu", "chóng mặt", "buồn nôn", "sưng", "hạn chế vận động",
];

export async function requireAiManager(request: Request) {
  const { user } = await getUserFromRequest(request);
  if (!user) throw new Error("AUTH:Please sign in again.");
  const admin = createServiceSupabaseClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("AUTH:Could not verify AI access.");
  if (profile.role !== "admin" && profile.role !== "manager") {
    throw new Error("AUTH:Only admins and managers can use FXA AI.");
  }
  return { user, admin, role: profile.role as "admin" | "manager" };
}

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function countsFor(rows: Array<{ status: string | null }>): AttendanceCounts {
  return {
    completed: rows.filter((row) => COMPLETED.has(normalize(row.status))).length,
    noShow: rows.filter((row) => normalize(row.status) === "no_show").length,
    lateCancel: rows.filter((row) => normalize(row.status) === "late_cancel").length,
    cancelled: rows.filter((row) => ["cancelled", "canceled"].includes(normalize(row.status))).length,
    failed: rows.filter((row) => normalize(row.status) === "failed").length,
  };
}

function priorityFor(remaining: number | null, counts: AttendanceCounts, concerns: number, notes: number): Priority {
  const attendanceIssues = counts.noShow + counts.lateCancel;
  if (concerns >= 2 || attendanceIssues >= 3) return "high";
  if (concerns === 1 || attendanceIssues >= 1 || notes === 0 || (remaining !== null && remaining <= 3)) return "medium";
  return "low";
}

function fallback(language: SummaryLanguage, counts: AttendanceCounts, remaining: number | null, notes: number) {
  if (language === "vi") {
    return [
      "TỔNG QUAN",
      notes ? "Đã tổng hợp các chỉ số từ lịch sử buổi tập. Phần nhận xét AI hiện không khả dụng." : "Chưa có đủ session note để đánh giá tiến triển.",
      "",
      "CHUYÊN CẦN",
      `Hoàn thành ${counts.completed} buổi, no-show ${counts.noShow}, hủy muộn ${counts.lateCancel}.`,
      "",
      "HÀNH ĐỘNG ĐỀ XUẤT",
      remaining !== null && remaining <= 3 ? `Khách còn ${remaining} buổi. Nên follow-up renewal.` : "Kiểm tra session notes gốc trước khi quyết định bước tiếp theo.",
    ].join("\n");
  }

  return [
    "OVERVIEW",
    notes ? "Metrics were summarized from session history. The AI narrative is temporarily unavailable." : "There are not enough session notes for a progress assessment.",
    "",
    "ATTENDANCE",
    `${counts.completed} completed, ${counts.noShow} no-show, ${counts.lateCancel} late cancel.`,
    "",
    "RECOMMENDED ACTION",
    remaining !== null && remaining <= 3 ? `${remaining} sessions remain. Renewal follow-up is recommended.` : "Review original session notes before deciding the next action.",
  ].join("\n");
}

export async function buildClientReview(
  clientId: string,
  rangeDays: number,
  language: SummaryLanguage,
): Promise<ClientSummaryItem> {
  const admin = createServiceSupabaseClient();
  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, client_code, full_name, status, client_note, assigned_trainer_id, assigned_nutrition_coach_id")
    .eq("id", clientId)
    .single();
  if (clientError || !client) throw new Error("Client not found.");

  const from = new Date();
  from.setDate(from.getDate() - rangeDays);

  const [{ data: packages, error: packageError }, { data: sessions, error: historyError }] = await Promise.all([
    admin.from("session_packages").select("remaining_sessions, total_sessions, used_sessions, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1),
    admin.from("session_history").select("session_type, status, message, trainer_note, created_at").eq("client_id", clientId).gte("created_at", from.toISOString()).order("created_at", { ascending: false }).limit(100),
  ]);
  if (packageError) throw packageError;
  if (historyError) throw historyError;

  const staffIds = [client.assigned_trainer_id, client.assigned_nutrition_coach_id].filter(Boolean) as string[];
  const { data: staff, error: staffError } = staffIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", staffIds)
    : { data: [], error: null };
  if (staffError) throw staffError;
  const names = new Map((staff || []).map((person) => [person.id, person.full_name || person.email || "Staff"]));

  const latestPackage = packages?.[0] || null;
  const remaining = latestPackage
    ? latestPackage.remaining_sessions !== null && latestPackage.remaining_sessions !== undefined
      ? Number(latestPackage.remaining_sessions)
      : Math.max(Number(latestPackage.total_sessions || 0) - Number(latestPackage.used_sessions || 0), 0)
    : null;
  const rows = sessions || [];
  const counts = countsFor(rows);
  const notes = rows.filter((row) => String(row.trainer_note || row.message || "").trim()).length;
  const concerns = rows.filter((row) => {
    const text = `${row.trainer_note || ""} ${row.message || ""}`.toLowerCase();
    return CONCERNS.some((keyword) => text.includes(keyword));
  }).length;
  const priority = priorityFor(remaining, counts, concerns, notes);
  const lowSessions = remaining !== null && remaining <= 3;
  const poorAttendance = counts.noShow + counts.lateCancel >= 2;
  const missingNotes = notes === 0;
  let summary = fallback(language, counts, remaining, notes);
  let aiError: string | null = null;
  let aiProvider: string | null = null;
  let aiModel: string | null = null;

  const noteText = rows
    .slice(0, 30)
    .map((row) => `${row.created_at || ""} | ${row.session_type || "session"} | ${row.status || ""} | ${row.trainer_note || row.message || "No note"}`)
    .join("\n");

  try {
    const ai = await generateAiText({
      system: "You are the FXA FITNESS client review assistant. Summarize documented training and nutrition records accurately. Do not invent facts. You are not a doctor and must not diagnose medical conditions. Give concise, actionable coaching follow-up.",
      prompt: `${language === "vi" ? "Write in Vietnamese." : "Write in English."}\nClient: ${client.full_name}\nRemaining sessions: ${remaining ?? "unknown"}\nCompleted: ${counts.completed}; no-show: ${counts.noShow}; late cancel: ${counts.lateCancel}.\nClient note: ${client.client_note || "None"}\nRecent session records:\n${noteText || "No session notes available."}\n\nUse sections: OVERVIEW/TỔNG QUAN, PROGRESS/TIẾN TRIỂN, ATTENDANCE/CHUYÊN CẦN, CONCERNS/LƯU Ý, RECOMMENDED ACTION/HÀNH ĐỘNG ĐỀ XUẤT.`,
      maxTokens: 650,
    });
    summary = ai.text;
    aiProvider = ai.provider;
    aiModel = ai.model;
  } catch (error) {
    aiError = error instanceof Error ? error.message : "AI provider unavailable.";
  }

  return {
    clientId: client.id,
    clientCode: client.client_code,
    clientName: client.full_name,
    clientStatus: client.status,
    assignedTrainer: names.get(client.assigned_trainer_id || "") || null,
    assignedNutritionCoach: names.get(client.assigned_nutrition_coach_id || "") || null,
    summary,
    priority,
    needsAttention: priority !== "low" || lowSessions || poorAttendance || missingNotes,
    lowSessions,
    missingNotes,
    poorAttendance,
    documentedConcernMentions: concerns,
    remainingSessions: remaining,
    recordsReviewed: rows.length,
    notesReviewed: notes,
    latestSessionAt: rows[0]?.created_at || null,
    counts,
    aiError,
    aiProvider,
    aiModel,
  };
}

export function aiRouteError(error: unknown) {
  const message = error instanceof Error ? error.message : "AI request failed.";
  const auth = message.startsWith("AUTH:");
  return Response.json(
    { success: false, error: auth ? message.slice(5) : message },
    { status: auth ? (message.includes("sign in") ? 401 : 403) : 500 },
  );
}
