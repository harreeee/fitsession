import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ClientRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  profile_id: string | null;
};

type SessionHistoryRow = {
  id: string;
  client_id: string | null;
  trainer_id: string | null;
  package_id?: string | null;
  status: string | null;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string | null;
};

type TrainerProfile = {
  id: string;
  full_name: string | null;
};

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Invalid user session." },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email?.trim().toLowerCase() || "";

    const { data: clientsData, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email, profile_id")
      .or(`profile_id.eq.${userId},email.eq.${userEmail}`);

    if (clientsError) {
      return NextResponse.json(
        { error: `Client lookup failed: ${clientsError.message}` },
        { status: 500 }
      );
    }

    const clients = (clientsData || []) as ClientRow[];

    if (clients.length === 0) {
      return NextResponse.json(
        {
          error:
            "No client row found for this login. Check clients.profile_id or clients.email.",
          debug: {
            user_id: userId,
            user_email: userEmail,
            matched_clients_count: 0,
          },
        },
        { status: 404 }
      );
    }

    const clientIds = clients.map((client) => client.id);

    /*
      lookupClientIds keeps support for older history rows that may have been
      saved using clients.profile_id before. New scans should use clients.id.
    */
    const lookupClientIds = Array.from(
      new Set(
        clients
          .flatMap((client) => [client.id, client.profile_id])
          .filter((value): value is string => Boolean(value))
      )
    );

    const { data: sessionHistoryData, error: sessionHistoryError } =
  await supabaseAdmin
    .from("session_history")
    .select(
      "id, client_id, trainer_id, package_id, status, message, trainer_note, remaining_after, created_at"
    )
    .in("client_id", lookupClientIds)
    .order("created_at", { ascending: false })
    .limit(100);

    if (sessionHistoryError) {
      return NextResponse.json(
        { error: `Session history lookup failed: ${sessionHistoryError.message}` },
        { status: 500 }
      );
    }

    const sessionHistoryRows = (sessionHistoryData ||
      []) as SessionHistoryRow[];

    const trainerIds = Array.from(
      new Set(
        sessionHistoryRows
          .map((log) => log.trainer_id)
          .filter((trainerId): trainerId is string => Boolean(trainerId))
      )
    );

    let trainerMap = new Map<string, string>();

    if (trainerIds.length > 0) {
      const { data: trainerProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", trainerIds);

      trainerMap = new Map(
        ((trainerProfiles || []) as TrainerProfile[]).map((profile) => [
          profile.id,
          profile.full_name || "Unknown Trainer",
        ])
      );
    }

    const logs = sessionHistoryRows.map((log) => ({
      id: log.id,
      client_id: log.client_id,
      trainer_id: log.trainer_id,
      package_id: log.package_id || null,
      status: log.status || "success",
      message: log.message || null,
      trainer_note: log.trainer_note || null,
      remaining_after: log.remaining_after,
      created_at: log.created_at || new Date().toISOString(),
      source: "session_history",
      trainer_name:
        log.trainer_id && trainerMap.get(log.trainer_id)
          ? trainerMap.get(log.trainer_id)
          : "Admin / Manual",
    }));

    return NextResponse.json({
      logs,
      client: {
        matched_client_ids: clientIds,
        matched_clients: clients.map((client) => ({
          id: client.id,
          full_name: client.full_name,
          email: client.email,
          profile_id: client.profile_id,
        })),
      },
      debug: {
        user_id: userId,
        user_email: userEmail,
        matched_clients_count: clients.length,
        matched_client_ids: clientIds,
        lookup_client_ids: lookupClientIds,
        session_history_count: sessionHistoryRows.length,
        returned_count: logs.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}