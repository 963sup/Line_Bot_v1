import type { IssueCommand } from "@line_bot_v1/issue/contracts/input/issues";
import type { IssueSnapshot } from "@line_bot_v1/issue/contracts/repositories/issues";

const permissions = new Set(["read", "triage", "triage_plus", "write", "maintain", "admin"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRepository(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ownerLogin === "string" &&
    typeof value.name === "string" &&
    strings(value.permissions) &&
    value.permissions.every((permission) => permissions.has(permission))
  );
}

function isIssue(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repositoryId === "string" &&
    Number.isSafeInteger(value.number) &&
    typeof value.publisher === "string" &&
    strings(value.assignees) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.criteria === "string" &&
    (value.state === "OPEN" || value.state === "CLOSED") &&
    (value.stateReason === null ||
      value.stateReason === "COMPLETED" ||
      value.stateReason === "DUPLICATE" ||
      value.stateReason === "NOT_PLANNED" ||
      value.stateReason === "REOPENED") &&
    (value.workflowStatus === "pending" ||
      value.workflowStatus === "active" ||
      value.workflowStatus === "review" ||
      value.workflowStatus === "completed") &&
    Number.isSafeInteger(value.version) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isIssueSnapshot(value: unknown): value is IssueSnapshot {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    Array.isArray(value.repositories) &&
    value.repositories.every(isRepository) &&
    Array.isArray(value.participants) &&
    value.participants.every(
      (item) => isRecord(item) && typeof item.userId === "string" && typeof item.name === "string",
    ) &&
    Array.isArray(value.issues) &&
    value.issues.every(isIssue) &&
    Array.isArray(value.events) &&
    value.events.every(
      (item) =>
        isRecord(item) &&
        typeof item.issueId === "string" &&
        typeof item.actor === "string" &&
        typeof item.action === "string" &&
        typeof item.note === "string" &&
        isRecord(item.data) &&
        Number.isSafeInteger(item.version) &&
        typeof item.at === "number",
    ) &&
    (!("next" in value) || value.next === null || typeof value.next === "string")
  );
}

function errorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export async function requestIssueSnapshot({
  token,
  issueNumber,
  repositoryId,
  ownerLogin,
  repositoryName,
  repository,
  view,
}: {
  token: string;
  issueNumber?: number;
  repositoryId?: string;
  ownerLogin?: string;
  repositoryName?: string;
  repository: string;
  view: "all" | "mine" | "created";
}): Promise<IssueSnapshot> {
  if (issueNumber !== undefined) {
    const detailQuery = new URLSearchParams();
    if (ownerLogin && repositoryName) {
      detailQuery.set("owner", ownerLogin);
      detailQuery.set("name", repositoryName);
    }
    const suffix = detailQuery.size ? `?${detailQuery}` : "";
    const response = await fetch(`/api/issues/${issueNumber}${suffix}`, {
      headers: { "X-App-Session-Generation": token },
      cache: "no-store",
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(errorMessage(value, "Issue 讀取失敗。"));
    if (!isIssueSnapshot(value)) throw new Error("Issue 回應格式不正確。");
    const snapshot = value;
    if (repositoryId && snapshot.issues[0]?.repositoryId !== repositoryId) {
      throw new Error("Issue 不屬於指定儲存庫。");
    }
    return snapshot;
  }

  const query = new URLSearchParams({ issueView: view });
  if (ownerLogin && repositoryName) {
    query.set("owner", ownerLogin);
    query.set("name", repositoryName);
  } else if (repository) {
    query.set("repository", repository);
  }
  const response = await fetch(`/api/issues?${query}`, {
    headers: { "X-App-Session-Generation": token },
    cache: "no-store",
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(value, "Issue 讀取失敗。"));
  if (!isIssueSnapshot(value)) throw new Error("Issue 回應格式不正確。");
  return value;
}

export async function postIssueCommand(token: string, command: IssueCommand) {
  const response = await fetch("/api/issues", {
    method: "POST",
    headers: {
      "X-App-Session-Generation": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const value: unknown = await response.json();
  return { response, value: { error: errorMessage(value, "") } };
}
