export const lineRetryWindow = 23 * 60 * 60 * 1000;
export function deliveryRetry(attempts: number, now: number, firstAt: number) {
  const next = now + Math.min(3600000, 1000 * 2 ** Math.min(attempts, 12));
  return next < firstAt + lineRetryWindow ? next : null;
}
