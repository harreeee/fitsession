import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AiProviderResult = {
  text: string;
  provider: "anthropic" | "openai";
  model: string;
};

type GenerateInput = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

function clean(value: string | undefined) {
  return String(value || "").trim();
}

export function getAiProviderStatus() {
  const anthropicKey = clean(process.env.ANTHROPIC_API_KEY);
  const anthropicModel = clean(process.env.ANTHROPIC_MODEL);
  const openAiKey = clean(process.env.OPENAI_API_KEY);
  const openAiModel = clean(process.env.OPENAI_MODEL) || "gpt-5.6-luna";

  return {
    anthropicReady: Boolean(anthropicKey && anthropicModel),
    anthropicModel: anthropicModel || null,
    openAiReady: Boolean(openAiKey),
    openAiModel: openAiKey ? openAiModel : null,
  };
}

export async function generateAiText({
  system,
  prompt,
  maxTokens = 700,
}: GenerateInput): Promise<AiProviderResult> {
  const anthropicKey = clean(process.env.ANTHROPIC_API_KEY);
  const anthropicModel = clean(process.env.ANTHROPIC_MODEL);
  const openAiKey = clean(process.env.OPENAI_API_KEY);
  const openAiModel = clean(process.env.OPENAI_MODEL) || "gpt-5.6-luna";
  const providerErrors: string[] = [];

  if (anthropicKey && anthropicModel) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const response = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!text) throw new Error("Claude returned an empty response.");

      return { text, provider: "anthropic", model: anthropicModel };
    } catch (error) {
      providerErrors.push(
        `Claude: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }

  if (openAiKey) {
    try {
      const openai = new OpenAI({ apiKey: openAiKey });
      const response = await openai.responses.create({
        model: openAiModel,
        max_output_tokens: maxTokens,
        input: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });
      const text = response.output_text.trim();

      if (!text) throw new Error("OpenAI returned an empty response.");

      return { text, provider: "openai", model: openAiModel };
    } catch (error) {
      providerErrors.push(
        `OpenAI: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }

  if (!anthropicKey || !anthropicModel) {
    providerErrors.unshift("Claude is not configured.");
  }
  if (!openAiKey) {
    providerErrors.push("OpenAI is not configured.");
  }

  throw new Error(`No working AI provider. ${providerErrors.join(" ")}`);
}
