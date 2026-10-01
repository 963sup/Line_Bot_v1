import { IssueError } from "../errors/issue-error.js";

export function issueText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new IssueError(400, `請填寫 1 至 ${max} 字的內容。`);
  }
  return value.trim();
}
