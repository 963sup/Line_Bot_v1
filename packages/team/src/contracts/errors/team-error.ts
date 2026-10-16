export class TeamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TeamError";
  }
}

export function teamAssert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new TeamError(status, message);
}
