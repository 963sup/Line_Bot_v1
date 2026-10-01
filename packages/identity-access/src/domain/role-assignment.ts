export class GovernanceAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | "invalid-input"
      | "not-found"
      | "forbidden"
      | "inactive"
      | "invalid-transition"
      | "last-effective-role-holder"
      | "conflict"
      | "stale-version"
      | "scope-conflict"
      | "consent-required"
      | "replay-conflict"
      | "unknown-result",
    message: string,
  ) {
    super(message);
    this.name = "GovernanceAccessError";
  }
}
