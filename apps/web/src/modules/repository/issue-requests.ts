import type { IssueCommand, IssueSnapshot } from "@line_bot_v1/repository/application/ports/issues";

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
      headers: { "x-line-token": token },
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Issue 讀取失敗。");
    const snapshot = value as IssueSnapshot;
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
    headers: { "x-line-token": token },
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Issue 讀取失敗。");
  return value as IssueSnapshot;
}

export async function postIssueCommand(token: string, command: IssueCommand) {
  const response = await fetch("/api/issues", {
    method: "POST",
    headers: {
      "x-line-token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  return { response, value: await response.json() };
}
