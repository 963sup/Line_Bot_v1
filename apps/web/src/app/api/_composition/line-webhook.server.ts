import { createHash } from "node:crypto";
import {
  type LineWebhookEvent,
  parseLineWebhook,
  verifyLineSignature,
} from "@line-work/line-channel/adapters/messaging";

const response = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export type LineWebhookIngressOutcome = "verification" | "events_received";

/**
 * LINE Webhook 的 HTTP / provider admission boundary。
 * 只處理 bounded body、signature 與 envelope。
 * 成功後把可信事件交給產品 interaction router；不擁有 Account／Assistant／Attendance／Expense 規則。
 */
export function createLineWebhookIngress(config: {
  channelSecret: string;
  handleEvents: (events: LineWebhookEvent[], idempotencyScope: string) => Promise<number>;
  report?: (outcome: LineWebhookIngressOutcome) => void;
}) {
  const idempotencyScope = createHash("sha256").update(config.channelSecret).digest("hex");

  return async (request: Request): Promise<Response> => {
    if (!config.channelSecret) return response(503);

    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1_048_576) {
            await reader.cancel();
            return response(413);
          }
          chunks.push(value);
        }
    } catch {
      return response(400);
    }

    const raw = Buffer.concat(chunks);
    if (!verifyLineSignature(raw, request.headers.get("x-line-signature"), config.channelSecret))
      return response(401);

    const envelope = parseLineWebhook(raw);
    if (!envelope) return response(400);

    config.report?.(envelope.events.length ? "events_received" : "verification");
    return response(await config.handleEvents(envelope.events, idempotencyScope));
  };
}
