export type PulseQuery = Readonly<{ repositoryId: string; from?: number; to?: number }>;
export function pulseQuery(input: PulseQuery, now: number) {
  const to = input.to ?? now,
    from = input.from ?? Math.max(0, to - 7 * 24 * 60 * 60 * 1000);
  if (
    typeof input.repositoryId !== "string" ||
    !input.repositoryId ||
    input.repositoryId.length > 128 ||
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    from >= to
  )
    throw new Error("Invalid Repository Pulse interval or scope.");
  return { repositoryId: input.repositoryId, from, to, timeZone: "Asia/Taipei" as const };
}
