import { requireAdminAccess, staffAccessFail } from "@/lib/staffAccessServer";

type UpdateBody = {
  staffId?: string;
  canViewRevenue?: boolean;
  canViewClients?: boolean;
  canViewBookedCalendar?: boolean;
};

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminAccess(request);
    const { data, error } = await admin
      .from("profiles")
      .select(
        "id, full_name, email, role, can_view_revenue, can_view_clients, can_view_booked_calendar",
      )
      .in("role", ["trainer", "nutrition_coach"])
      .order("full_name");

    if (error) throw error;

    return Response.json(
      { staff: data || [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return staffAccessFail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await requireAdminAccess(request);
    const body = (await request.json()) as UpdateBody;
    const staffId = String(body.staffId || "").trim();

    if (!/^[0-9a-f-]{36}$/i.test(staffId)) {
      return Response.json({ error: "Invalid staff ID." }, { status: 400 });
    }

    if (
      typeof body.canViewRevenue !== "boolean" ||
      typeof body.canViewClients !== "boolean" ||
      typeof body.canViewBookedCalendar !== "boolean"
    ) {
      return Response.json(
        { error: "All permission values are required." },
        { status: 400 },
      );
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", staffId)
      .single();

    if (targetError || !target) {
      return Response.json({ error: "Staff member not found." }, { status: 404 });
    }

    if (target.role !== "trainer" && target.role !== "nutrition_coach") {
      return Response.json(
        { error: "Granular permissions are only for trainers and nutrition coaches." },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("profiles")
      .update({
        can_view_revenue: body.canViewRevenue,
        can_view_clients: body.canViewClients,
        can_view_booked_calendar: body.canViewBookedCalendar,
      })
      .eq("id", staffId)
      .select(
        "id, full_name, email, role, can_view_revenue, can_view_clients, can_view_booked_calendar",
      )
      .single();

    if (error) throw error;

    return Response.json({ success: true, staff: data });
  } catch (error) {
    return staffAccessFail(error);
  }
}
