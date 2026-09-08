import { aiRouteError, buildClientReview, requireAiManager, type SummaryLanguage } from "@/lib/clientAiReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireAiManager(request);
    const body = (await request.json()) as {
      clientId?: string;
      rangeDays?: number;
      language?: SummaryLanguage;
    };
    const clientId = String(body.clientId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
      return Response.json({ success: false, error: "Invalid client ID." }, { status: 400 });
    }
    const rangeDays = Math.min(Math.max(Math.trunc(Number(body.rangeDays || 30)), 7), 365);
    const language: SummaryLanguage = body.language === "vi" ? "vi" : "en";
    const item = await buildClientReview(clientId, rangeDays, language);

    return Response.json({
      success: true,
      summary: item.summary,
      generatedAt: new Date().toISOString(),
      recordsReviewed: item.recordsReviewed,
      notesReviewed: item.notesReviewed,
      rangeDays,
      remainingSessions: item.remainingSessions,
      counts: item.counts,
      aiProvider: item.aiProvider,
      aiModel: item.aiModel,
      aiError: item.aiError,
    });
  } catch (error) {
    return aiRouteError(error);
  }
}
