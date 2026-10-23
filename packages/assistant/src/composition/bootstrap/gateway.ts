import { createGatewayTextGenerator } from "../../adapters/outbound/external-api/vercel-ai.js";

/** Composition owns selecting and configuring the concrete Gateway provider. */
export function createGatewayAssistant(config: { model: string }) {
  const generate = createGatewayTextGenerator(config);
  return { generate };
}
