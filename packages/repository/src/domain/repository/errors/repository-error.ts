export class RepositoryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
