import { RepositoryError } from "../../repository/errors/repository-error.js";

export class IssueError extends RepositoryError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "IssueError";
  }
}
