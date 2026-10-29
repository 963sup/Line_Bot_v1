import type { AssistantEvent } from "./reply.js";

export type WebhookIdempotencyStore = {
  claim(
    scope: string,
    eventId: string,
  ): Promise<
    | { state: "claimed"; token: string }
    | { state: "pending" }
    | { state: "completed"; status: number }
  >;
  complete(scope: string, eventId: string, token: string, status: number): Promise<boolean>;
};

export type SelectedWebhookEvent = {
  id: string;
  token: string;
  userId: string;
  ai: boolean;
  agentInput?: string;
  assistant?: AssistantEvent;
  attendanceMenu?: boolean;
};

export type WebhookRouterOutcome =
  | "replied"
  | "handled_silently"
  | "reply_failed"
  | "idempotency_unavailable";

/** Dispatch verified interaction intents with qualification, replay and bounded completion. */
export function createAssistantWebhookRouter(config: {
  idempotency(): WebhookIdempotencyStore;
  authorize: (userId: string) => boolean | Promise<boolean>;
  replyMembership?: (replyToken: string, userId: string) => Promise<unknown>;
  replyUnavailable?: (replyToken: string, error: unknown) => Promise<unknown>;
  reply: (replyToken: string) => Promise<unknown>;
  replyAiTest?: (replyToken: string) => Promise<unknown>;
  replyAgent?: (replyToken: string, input: string) => Promise<unknown>;
  replyAssistant?: (replyToken: string, event: AssistantEvent) => Promise<unknown>;
  attendanceMenu?: (userId: string) => Promise<void>;
  report?: (outcome: WebhookRouterOutcome) => void;
  observeError(
    error: unknown,
    context: {
      operation: "user-authorization" | "reply" | "idempotency";
      status: number;
    },
  ): void;
}) {
  return async (
    selected: readonly SelectedWebhookEvent[],
    idempotencyScope: string,
  ): Promise<number> => {
    const runEvent = async ({
      id,
      token,
      userId,
      ai,
      agentInput,
      assistant,
      attendanceMenu,
    }: SelectedWebhookEvent) => {
      try {
        const store = config.idempotency();
        const claim = await store.claim(idempotencyScope, id);
        if (claim.state === "completed") return claim.status;
        if (claim.state === "pending") return 503;

        let status = 200;
        try {
          const execute = async () => {
            let authorized = true;
            try {
              authorized = await config.authorize(userId);
            } catch (error) {
              config.observeError(error, {
                operation: "user-authorization",
                status: 503,
              });
              if (assistant?.imageId) return false;
              if (config.replyUnavailable) return config.replyUnavailable(token, error);
              throw error;
            }
            if (!authorized) {
              return assistant?.imageId
                ? false
                : config.replyMembership
                  ? config.replyMembership(token, userId)
                  : false;
            }
            if (attendanceMenu) {
              const handler = config.attendanceMenu;
              if (!handler) throw new Error("Attendance menu handler is unavailable");
              await handler(userId);
              return false;
            }
            if (assistant) {
              const handler = config.replyAssistant;
              if (!handler) throw new Error("Assistant reply handler is unavailable");
              return handler(token, assistant);
            }
            if (agentInput !== undefined) {
              const handler = config.replyAgent;
              if (!handler) throw new Error("Agent reply handler is unavailable");
              return handler(token, agentInput);
            }
            if (ai) {
              const handler = config.replyAiTest;
              if (!handler) throw new Error("AI test reply handler is unavailable");
              return handler(token);
            }
            return config.reply(token);
          };
          const result = await execute();
          config.report?.(result === false ? "handled_silently" : "replied");
        } catch (error) {
          status = 502;
          config.observeError(error, {
            operation: "reply",
            status,
          });
          config.report?.("reply_failed");
        }
        return (await store.complete(idempotencyScope, id, claim.token, status)) ? status : 503;
      } catch (error) {
        config.observeError(error, {
          operation: "idempotency",
          status: 503,
        });
        config.report?.("idempotency_unavailable");
        return 503;
      }
    };

    const results = selected.map(runEvent);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.all(results).then((values) => values.find((value) => value !== 200) ?? 200),
        new Promise<number>((resolve) => {
          timer = setTimeout(
            () => resolve(503),
            selected.some((event) => event.agentInput !== undefined || event.assistant)
              ? 20_000
              : 10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
