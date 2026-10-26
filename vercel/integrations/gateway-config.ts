import { IntelligenceError } from "@line_bot_v1/intelligence/domain/error";

export function modelName(value: string) {
  if (!/^[a-z0-9-]+\/[a-zA-Z0-9._-]+$/.test(value))
    throw new IntelligenceError(503, "AI Gateway model is invalid.", "EXTRACTION_UNAVAILABLE");
  return value;
}

export function gatewayConfiguration(): { model: string } | undefined {
  const model = process.env.AI_GATEWAY_MODEL;
  return model && (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
    ? { model }
    : undefined;
}
