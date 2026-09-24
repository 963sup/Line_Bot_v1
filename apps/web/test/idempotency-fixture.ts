import { randomUUID } from "node:crypto";
import type { WebhookIdempotencyStore } from "../src/app/api/_composition/line-webhook-router.server";

/** Test double only; production always uses Redis. Share one fixture to model two instances. */
export function idempotencyFixture(): WebhookIdempotencyStore {
  const entries = new Map<string, { token: string; status?: number }>();
  return {
    async claim(scope, id) {
      const key = JSON.stringify([scope, id]);
      const existing = entries.get(key);
      if (existing)
        return existing.status === undefined
          ? { state: "pending" }
          : { state: "completed", status: existing.status };
      const token = randomUUID();
      entries.set(key, { token });
      return { state: "claimed", token };
    },
    async complete(scope, id, token, status) {
      const entry = entries.get(JSON.stringify([scope, id]));
      if (!entry || entry.token !== token || entry.status !== undefined) return false;
      entry.status = status;
      return true;
    },
  };
}
