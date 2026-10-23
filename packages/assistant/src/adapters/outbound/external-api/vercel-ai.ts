import { generateText } from "ai";
import { requireValue } from "../../provider-runtime.js";

/** AI SDK uses Vercel AI Gateway when passed a provider/model identifier. */
export function createGatewayTextGenerator(config: { apiKey: string; model: string }) {
  requireValue(config.apiKey, "AI_GATEWAY_API_KEY");
  const model = requireValue(config.model, "AI_GATEWAY_MODEL");
  if (!/^[a-z0-9-]+\/[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error("Invalid AI_GATEWAY_MODEL");
  }
  return async (input: { prompt: string; system: string }): Promise<string> => {
    const { text } = await generateText({
      model,
      prompt: input.prompt,
      system: input.system,
      maxOutputTokens: 600,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(10_000),
    });
    return text;
  };
}
