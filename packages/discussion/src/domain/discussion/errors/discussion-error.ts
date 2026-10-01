export class DiscussionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscussionError";
  }
}
