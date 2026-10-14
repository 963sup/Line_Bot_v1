import type {
  BaselineNotifications,
  LineTextSender,
} from "../../contracts/output/baseline-delivery.js";
import type { BaselineDeliveryStore } from "../../contracts/repositories/baseline-delivery.js";
export function createBaselineNotifications(deps: {
  store: BaselineDeliveryStore;
  send: LineTextSender;
  inboxUrl: string;
  now: () => number;
}): BaselineNotifications {
  const url = new URL(deps.inboxUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/notifications"
  )
    throw new TypeError("A fixed HTTPS Inbox URL is required.");
  const payload = `WBS 已發布新基準。請前往 Inbox 查看通知：${url.href}`;
  return {
    async deliver(input, live) {
      if (!(await live()))
        return { inbox: "skipped", notificationId: null, line: "cancelled", nextAt: null };
      await deps.store.create(input, payload, deps.now());
      const current = await deps.store.claim(input.key, deps.now());
      if (!current.claim) return current.result;
      if (!(await live())) return deps.store.complete(current.claim, "cancelled", deps.now());
      let outcome: "accepted" | "retry" | "failed" | "unavailable" | "unknown";
      try {
        outcome = await deps.send(
          current.claim.target,
          current.claim.payload,
          current.claim.retryKey,
        );
      } catch {
        outcome = "unknown";
      }
      if (!(await live())) return { ...current.result, line: "stale", nextAt: deps.now() + 60000 };
      return deps.store.complete(current.claim, outcome, deps.now());
    },
    cancel: (key, now) => deps.store.cancel(key, now),
  };
}
