type VerifiedProfileEntry = Readonly<{
  userId: string;
  login: string;
  token: string;
  verifiedAt: number;
}>;

const HANDOFF_TTL_MS = 30_000;
let current: VerifiedProfileEntry | undefined;

/**
 * Carries one freshly server-qualified Profile entry across an App Router navigation.
 * This is document-local optimization state, never an authorization source.
 */
export function rememberVerifiedProfileEntry(
  value: Omit<VerifiedProfileEntry, "verifiedAt">,
  now = Date.now(),
) {
  current = { ...value, verifiedAt: now };
}

export function readVerifiedProfileEntry(
  userId: string,
  login: string,
  now = Date.now(),
): VerifiedProfileEntry | null {
  const value = current;
  if (
    !value ||
    value.userId !== userId ||
    value.login !== login ||
    now < value.verifiedAt ||
    now - value.verifiedAt > HANDOFF_TTL_MS
  ) {
    current = undefined;
    return null;
  }
  return value;
}

export function clearVerifiedProfileEntry() {
  current = undefined;
}
