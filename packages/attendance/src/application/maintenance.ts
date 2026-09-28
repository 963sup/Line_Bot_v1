import type { AttendanceMaintenanceDependencies, NotificationOutcome } from "./ports/clock.js";

/** Independent durable delivery; no clock-boundary writes or external calls inside transactions. */
export function createAttendanceMaintenance(deps: AttendanceMaintenanceDependencies) {
  return async (subject?: string, includeNotifications = true) => {
    const store = deps.store();
    const result = { synced: 0, notified: 0, failed: 0 };
    const menus = Promise.all(
      Array.from({ length: subject ? 1 : 5 }, async () => {
        const job = await store.claimMenu(deps.now(), deps.provider(), subject);
        if (!job) return;
        let success = false;
        try {
          await deps.link(job.subject, job.state);
          success = true;
        } catch {
          /* durable retry */
        }
        if (await store.completeMenu(job, success, deps.now())) result.synced++;
        else result.failed++;
      }),
    );
    if (includeNotifications) {
      const notifications = Promise.all(
        Array.from({ length: subject ? 1 : 5 }, async () => {
          const job = await store.claimNotification(deps.now(), deps.provider(), subject);
          if (!job) return;
          let outcome: NotificationOutcome = "retry";
          try {
            outcome = await deps.notify(job);
          } catch {
            /* same retry key after network failure */
          }
          if (
            (await store.completeNotification(job, outcome, deps.now())) &&
            outcome === "accepted"
          )
            result.notified++;
          else result.failed++;
        }),
      );
      await Promise.all([menus, notifications]);
    } else await menus;
    return result;
  };
}
