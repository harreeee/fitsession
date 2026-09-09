import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isFollowMethod,
  isFollowOutcome,
  isFollowRequirement,
  isNutritionPriority,
  isWorkflowStatus,
  workflowStatusFromOutcome,
} from "@/lib/nutrition";
import {
  canEditNutritionRequirement,
  canManageNutritionAssignments,
  canRecordNutritionFollow,
  getNutritionAccessContext,
  NutritionAccessError,
  nutritionFail,
} from "@/lib/nutritionServer";

function cleanText(value: unknown, max = 4000) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function cleanDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new NutritionAccessError("Invalid date.", 400);
  }
  return value;
}

function cleanUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new NutritionAccessError("Invalid ID.", 400);
  }
  return value;
}

function fourRPayload(body: Record<string, unknown>) {
  const result = Boolean(body.result4r);
  const review = Boolean(body.review4r);
  const refer = Boolean(body.refer4r);
  const renew = Boolean(body.renew4r);
  const resultDetail = cleanText(body.result4rDetail, 1200);
  const reviewDetail = cleanText(body.review4rDetail, 1200);
  const referDetail = cleanText(body.refer4rDetail, 1200);
  const renewDetail = cleanText(body.renew4rDetail, 1200);

  const missing: string[] = [];
  if (result && !resultDetail) missing.push("Result");
  if (review && !reviewDetail) missing.push("Review");
  if (refer && !referDetail) missing.push("Refer");
  if (renew && !renewDetail) missing.push("Renew");
  if (missing.length) {
    throw new NutritionAccessError(
      `Ghi rõ nội dung cho 4R: ${missing.join(", ")}.`,
      400,
    );
  }

  return {
    result_4r: result,
    result_4r_detail: result ? resultDetail : null,
    review_4r: review,
    review_4r_detail: review ? reviewDetail : null,
    refer_4r: refer,
    refer_4r_detail: refer ? referDetail : null,
    renew_4r: renew,
    renew_4r_detail: renew ? renewDetail : null,
  };
}

async function requireActiveClient(admin: SupabaseClient, clientId: string) {
  const { data, error } = await admin
    .from("clients")
    .select("id, status, assigned_nutrition_coach_id")
    .eq("id", clientId)
    .single();

  if (error || !data || String(data.status || "").toLowerCase() === "inactive") {
    throw new NutritionAccessError("Client not found.", 404);
  }

  return data;
}

async function getEffectiveNutritionCoachId(
  admin: SupabaseClient,
  clientId: string,
  fallbackCoachId: string | null,
) {
  const { data, error } = await admin
    .from("nutrition_client_status")
    .select("nutrition_coach_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) throw error;
  return (data?.nutrition_coach_id as string | null) || fallbackCoachId || null;
}

async function requireClientAccess(
  admin: SupabaseClient,
  _profile: { id: string; role: string },
  clientId: string,
) {
  return requireActiveClient(admin, clientId);
}

async function requireNutritionCoach(admin: SupabaseClient, coachId: string) {
  const { data: coach, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", coachId)
    .single();

  if (error || !coach || coach.role !== "nutrition_coach") {
    throw new NutritionAccessError("Nutrition coach not found.", 400);
  }

  return coach.id as string;
}

export async function GET(request: Request) {
  try {
    const { admin, profile } = await getNutritionAccessContext(request);

    const [clientsResult, statusResult, profilesResult] = await Promise.all([
      admin
        .from("clients")
        .select(
          "id, profile_id, client_code, full_name, status, assigned_trainer_id, assigned_nutrition_coach_id",
        )
        .order("full_name", { ascending: true }),
      admin
        .from("nutrition_client_status")
        .select(
          "client_id, follow_requirement, follow_reason, workflow_status, priority, nutrition_coach_id, next_follow_at, admin_note, updated_by, updated_at",
        ),
      admin
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["trainer", "nutrition_coach", "admin", "manager"])
        .order("full_name", { ascending: true }),
    ]);

    for (const result of [clientsResult, statusResult, profilesResult]) {
      if (result.error) throw result.error;
    }

    const statusRows = statusResult.data || [];
    const activeClients = (clientsResult.data || []).filter(
      (client) => String(client.status || "").toLowerCase() !== "inactive",
    );
    const visibleClients = activeClients;
    const visibleClientIds = visibleClients.map((client) => client.id as string);
    const visibleClientSet = new Set(visibleClientIds);
    const visibleStatuses = statusRows.filter((row) =>
      visibleClientSet.has(row.client_id as string),
    );

    let logs: unknown[] = [];
    if (visibleClientIds.length > 0) {
      const logsResult = await admin
        .from("nutrition_follow_logs")
        .select(
          "id, client_id, nutrition_coach_id, follow_date, method, client_responded, nutrition_summary, body_comp, activity, current_issue, action_taken, follow_result, next_action, next_follow_at, outcome, result_4r, result_4r_detail, review_4r, review_4r_detail, refer_4r, refer_4r_detail, renew_4r, renew_4r_detail, created_at, updated_at",
        )
        .in("client_id", visibleClientIds)
        .order("follow_date", { ascending: false })
        .limit(1000);

      if (logsResult.error) throw logsResult.error;
      logs = logsResult.data || [];
    }

    const clientKeyToId = new Map<string, string>();
    for (const client of visibleClients) {
      clientKeyToId.set(client.id as string, client.id as string);
      if (client.profile_id) clientKeyToId.set(client.profile_id as string, client.id as string);
    }
    const historyClientKeys = Array.from(clientKeyToId.keys());
    let nutritionSessions: unknown[] = [];

    if (historyClientKeys.length > 0) {
      const sessionsResult = await admin
        .from("session_history")
        .select(
          "id, client_id, trainer_id, session_type, status, message, session_topic, session_content, trainer_note, photo_path, created_at",
        )
        .eq("session_type", "nutrition_follow_up")
        .in("client_id", historyClientKeys)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (sessionsResult.error) throw sessionsResult.error;
      nutritionSessions = (sessionsResult.data || [])
        .map((row) => ({
          ...row,
          client_id: clientKeyToId.get(row.client_id as string) || row.client_id,
        }))
        .filter((row) => visibleClientSet.has(row.client_id as string));
    }

    return Response.json(
      {
        viewer: profile,
        permissions: {
          canManageAssignments: canManageNutritionAssignments(profile.role),
          canEditRequirement: canEditNutritionRequirement(profile.role),
          canRecordFollow: canRecordNutritionFollow(profile.role),
        },
        clients: visibleClients,
        statuses: visibleStatuses,
        profiles: profilesResult.data || [],
        logs,
        nutritionSessions,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return nutritionFail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, profile } = await getNutritionAccessContext(request);
    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body) throw new NutritionAccessError("Invalid request.", 400);

    const clientId = cleanUuid(body.clientId);
    if (!clientId) throw new NutritionAccessError("Client is required.", 400);
    await requireClientAccess(admin, profile, clientId);

    const patch: Record<string, unknown> = {
      client_id: clientId,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(body, "followRequirement")) {
      if (!canEditNutritionRequirement(profile.role)) {
        throw new NutritionAccessError(
          "Only admin or manager can change follow requirement.",
          403,
        );
      }
      if (!isFollowRequirement(body.followRequirement)) {
        throw new NutritionAccessError("Invalid follow requirement.", 400);
      }
      patch.follow_requirement = body.followRequirement;
    }

    if (Object.prototype.hasOwnProperty.call(body, "followReason")) {
      if (!canEditNutritionRequirement(profile.role)) {
        throw new NutritionAccessError(
          "Only admin or manager can change follow reason.",
          403,
        );
      }
      patch.follow_reason = cleanText(body.followReason, 300);
    }

    if (Object.prototype.hasOwnProperty.call(body, "workflowStatus")) {
      if (!canRecordNutritionFollow(profile.role)) {
        throw new NutritionAccessError("Access denied.", 403);
      }
      if (!isWorkflowStatus(body.workflowStatus)) {
        throw new NutritionAccessError("Invalid workflow status.", 400);
      }
      patch.workflow_status = body.workflowStatus;
    }

    if (Object.prototype.hasOwnProperty.call(body, "priority")) {
      if (!canManageNutritionAssignments(profile.role)) {
        throw new NutritionAccessError(
          "Only admin or manager can change priority.",
          403,
        );
      }
      if (
        body.priority !== null &&
        body.priority !== "" &&
        !isNutritionPriority(body.priority)
      ) {
        throw new NutritionAccessError("Invalid priority.", 400);
      }
      patch.priority = body.priority || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "nutritionCoachId")) {
      if (!canManageNutritionAssignments(profile.role)) {
        throw new NutritionAccessError(
          "Only admin or manager can assign a nutrition coach.",
          403,
        );
      }
      const coachId = cleanUuid(body.nutritionCoachId);
      patch.nutrition_coach_id = coachId
        ? await requireNutritionCoach(admin, coachId)
        : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "nextFollowAt")) {
      patch.next_follow_at = cleanDate(body.nextFollowAt);
    }

    if (Object.prototype.hasOwnProperty.call(body, "adminNote")) {
      if (!canManageNutritionAssignments(profile.role)) {
        throw new NutritionAccessError(
          "Only admin or manager can edit admin notes.",
          403,
        );
      }
      patch.admin_note = cleanText(body.adminNote);
    }

    if (Object.keys(patch).length <= 3) {
      throw new NutritionAccessError("Nothing to update.", 400);
    }

    const { data, error } = await admin
      .from("nutrition_client_status")
      .upsert(patch, { onConflict: "client_id" })
      .select()
      .single();

    if (error) throw error;
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return nutritionFail(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, profile } = await getNutritionAccessContext(request);
    if (!canRecordNutritionFollow(profile.role)) {
      throw new NutritionAccessError("Access denied.", 403);
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!body) throw new NutritionAccessError("Invalid request.", 400);

    const clientId = cleanUuid(body.clientId);
    if (!clientId) throw new NutritionAccessError("Client is required.", 400);
    const client = await requireClientAccess(admin, profile, clientId);

    if (!isFollowMethod(body.method)) {
      throw new NutritionAccessError("Invalid follow method.", 400);
    }
    if (!isFollowOutcome(body.outcome)) {
      throw new NutritionAccessError("Invalid follow outcome.", 400);
    }

    let nutritionCoachId: string;
    if (profile.role === "nutrition_coach") {
      nutritionCoachId = profile.id;
    } else {
      const selectedCoachId = cleanUuid(body.nutritionCoachId);
      const fallbackCoachId = await getEffectiveNutritionCoachId(
        admin,
        clientId,
        (client.assigned_nutrition_coach_id as string | null) || null,
      );
      const coachId = selectedCoachId || fallbackCoachId;
      if (!coachId) {
        throw new NutritionAccessError(
          "Choose a Nutrition Coach before saving this follow report.",
          400,
        );
      }
      nutritionCoachId = await requireNutritionCoach(admin, coachId);
    }

    const nextFollowAt = cleanDate(body.nextFollowAt);
    const logRow = {
      client_id: clientId,
      nutrition_coach_id: nutritionCoachId,
      method: body.method,
      client_responded:
        typeof body.clientResponded === "boolean" ? body.clientResponded : null,
      nutrition_summary: cleanText(body.nutritionSummary),
      body_comp: cleanText(body.bodyComp),
      activity: cleanText(body.activity),
      current_issue: cleanText(body.currentIssue),
      action_taken: cleanText(body.actionTaken),
      follow_result: cleanText(body.followResult),
      next_action: cleanText(body.nextAction),
      next_follow_at: nextFollowAt,
      outcome: body.outcome,
      ...fourRPayload(body),
      created_by: profile.id,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data: log, error: logError } = await admin
      .from("nutrition_follow_logs")
      .insert(logRow)
      .select()
      .single();
    if (logError) throw logError;

    const statusPatch = {
      client_id: clientId,
      nutrition_coach_id: nutritionCoachId,
      workflow_status: workflowStatusFromOutcome(body.outcome),
      next_follow_at: nextFollowAt,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data: status, error: statusError } = await admin
      .from("nutrition_client_status")
      .upsert(statusPatch, { onConflict: "client_id" })
      .select()
      .single();
    if (statusError) throw statusError;

    return Response.json(
      { log, status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return nutritionFail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { admin, profile } = await getNutritionAccessContext(request);
    if (!canRecordNutritionFollow(profile.role)) {
      throw new NutritionAccessError("Access denied.", 403);
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!body) throw new NutritionAccessError("Invalid request.", 400);

    const logId = cleanUuid(body.logId);
    if (!logId) throw new NutritionAccessError("Follow report is required.", 400);

    const { data: existing, error: existingError } = await admin
      .from("nutrition_follow_logs")
      .select("id, client_id, nutrition_coach_id")
      .eq("id", logId)
      .single();
    if (existingError || !existing) {
      throw new NutritionAccessError("Follow report not found.", 404);
    }

    await requireClientAccess(admin, profile, existing.client_id as string);
    if (
      profile.role === "nutrition_coach" &&
      existing.nutrition_coach_id !== profile.id
    ) {
      throw new NutritionAccessError("You can only edit your own 4R records.", 403);
    }

    const patch = {
      ...fourRPayload(body),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("nutrition_follow_logs")
      .update(patch)
      .eq("id", logId)
      .select()
      .single();
    if (error) throw error;

    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return nutritionFail(error);
  }
}
