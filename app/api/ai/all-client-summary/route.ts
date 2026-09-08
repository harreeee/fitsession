import { aiRouteError, buildClientReview, requireAiManager, type SummaryLanguage } from "@/lib/clientAiReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { admin } = await requireAiManager(request);
    const body = (await request.json()) as {
      rangeDays?: number;
      language?: SummaryLanguage;
      offset?: number;
      batchSize?: number;
      activeOnly?: boolean;
    };
    const rangeDays = Math.min(Math.max(Math.trunc(Number(body.rangeDays || 30)), 7), 365);
    const offset = Math.max(Math.trunc(Number(body.offset || 0)), 0);
    const batchSize = Math.min(Math.max(Math.trunc(Number(body.batchSize || 4)), 1), 6);
    const language: SummaryLanguage = body.language === "vi" ? "vi" : "en";
    const activeOnly = body.activeOnly !== false;

    let query = admin
      .from("clients")
      .select("id", { count: "exact" })
      .order("full_name", { ascending: true });
    if (activeOnly) query = query.eq("status", "active");

    const { data, error, count } = await query.range(offset, offset + batchSize - 1);
    if (error) throw error;

    const clientIds = (data || []).map((row) => row.id);
    const items = await Promise.all(
      clientIds.map((id) => buildClientReview(id, rangeDays, language)),
    );
    const totalClients = count || 0;
    const nextOffset = offset + clientIds.length;

    return Response.json({
      success: true,
      items,
      totalClients,
      processed: Math.min(nextOffset, totalClients),
      nextOffset,
      done: nextOffset >= totalClients,
      rangeDays,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return aiRouteError(error);
  }
}
