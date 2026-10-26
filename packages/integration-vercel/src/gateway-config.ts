export function gatewayConfiguration(): { model: string } | undefined {
  const model = process.env.AI_GATEWAY_MODEL;
  return model && (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
    ? { model }
    : undefined;
}
