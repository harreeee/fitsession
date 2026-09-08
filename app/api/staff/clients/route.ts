import { requireStaffFeature, staffAccessFail } from "@/lib/staffAccessServer";

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaffFeature(request, "clients");

    const { data: clients, error } = await admin
      .from("clients")
      .select("id, client_code, full_name, status, assigned_trainer_id, assigned_nutrition_coach_id")
      .order("full_name")
      .limit(1000);

    if (error) throw error;

    const staffIds = Array.from(
      new Set(
        (clients || [])
          .flatMap((client) => [
            client.assigned_trainer_id,
            client.assigned_nutrition_coach_id,
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const { data: staff, error: staffError } = staffIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", staffIds)
      : { data: [], error: null };

    if (staffError) throw staffError;

    const names = new Map((staff || []).map((person) => [person.id, person.full_name]));

    return Response.json(
      {
        clients: (clients || []).map((client) => ({
          id: client.id,
          clientCode: client.client_code,
          fullName: client.full_name,
          status: client.status,
          trainerName: names.get(client.assigned_trainer_id || "") || null,
          nutritionCoachName:
            names.get(client.assigned_nutrition_coach_id || "") || null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return staffAccessFail(error);
  }
}
