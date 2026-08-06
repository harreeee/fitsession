import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey || !model) {
    return NextResponse.json(
      {
        success: false,
        error:
          "ANTHROPIC_API_KEY or ANTHROPIC_MODEL is missing from .env.local.",
      },
      { status: 500 },
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model,
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            "Reply with exactly this sentence: FXA Claude connection is working.",
        },
      ],
    });

    const message = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Claude API test error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Claude API error.",
      },
      { status: 500 },
    );
  }
}