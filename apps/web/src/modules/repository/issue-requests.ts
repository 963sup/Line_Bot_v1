import type { IssueCommand } from "@line_bot_v1/issue/contracts/input/issues";
import { isIssueSnapshot } from "@line_bot_v1/issue/contracts/parse-response";
import type { IssueSnapshot } from "@line_bot_v1/issue/contracts/repositories/issues";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
