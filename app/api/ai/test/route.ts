import { generateAiText, getAiProviderStatus } from "@/lib/aiProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getAiProviderStatus();

  try {
    const result = await generateAiText({
      system: "You are a connectivity health check.",
      prompt: "Reply with exactly this sentence: FXA AI connection is working.",
      maxTokens: 80,
    });

    return Response.json({
      success: true,
      message: result.text,
      provider: result.provider,
      model: result.model,
      configured: status,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown AI provider error.",
        configured: status,
      },
      { status: 500 },
    );
  }
}
