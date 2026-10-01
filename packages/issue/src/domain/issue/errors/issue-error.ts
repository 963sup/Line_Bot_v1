export class IssueError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "IssueError";
  }
}
