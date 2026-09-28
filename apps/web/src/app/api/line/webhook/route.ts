import { captureHandledServerError } from "../../../../shared/observability/server-error";
import { createLineWebhookHandler } from "../../_composition/line-webhook-wiring.server";

export const runtime = "nodejs";
let handler: ReturnType<typeof createLineWebhookHandler> | undefined;

export async function POST(request: Request) {
  if (!process.env.LINE_CHANNEL_SECRET || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    captureHandledServerError(new Error("LINE webhook server configuration unavailable."), {
      service: "line-webhook",
      operation: "configuration",
      status: 503,
    });
    return new Response(null, { status: 503 });
  }
  handler ??= createLineWebhookHandler(process.env.LINE_CHANNEL_SECRET);
  return handler(request);
}
