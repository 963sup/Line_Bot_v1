import type {
  IssueCollaborationCommand,
  IssueObjectReferenceView,
} from "@line_bot_v1/issue/contracts/collaboration";

export type AvailableObject = Readonly<{
  objectId: string;
  revisionId: string;
  typeName: string;
  name: string;
}>;

type AvailableObjectScope = Readonly<{
  actorUserId: string;
  repositoryId: string;
  items: readonly AvailableObject[];
}>;

export type ObjectReferenceCommand = Extract<
  IssueCollaborationCommand,
  { action: "set-object-reference" | "remove-object-reference" }
>;

export type PendingObjectReferenceOperation = Readonly<{
  actorUserId: string;
  repositoryId: string;
  issueId: string;
  command: ObjectReferenceCommand;
}>;

type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pendingKey(actorUserId: string, repositoryId: string, issueId: string) {
  return `issue-object-reference-pending:${encodeURIComponent(actorUserId)}:${encodeURIComponent(
    repositoryId,
  )}:${encodeURIComponent(issueId)}`;
}

function objectReferenceCommand(value: unknown): value is ObjectReferenceCommand {
  if (
    !record(value) ||
    (value.action !== "set-object-reference" && value.action !== "remove-object-reference") ||
    typeof value.requestId !== "string" ||
    typeof value.repositoryId !== "string" ||
    typeof value.issueId !== "string" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    typeof value.objectId !== "string"
  ) {
    return false;
  }
  return value.action === "remove-object-reference" || typeof value.revisionId === "string";
}

function pendingOperation(
  value: unknown,
  actorUserId: string,
  repositoryId: string,
  issueId: string,
): value is PendingObjectReferenceOperation {
  return (
    record(value) &&
    value.actorUserId === actorUserId &&
    value.repositoryId === repositoryId &&
    value.issueId === issueId &&
    objectReferenceCommand(value.command) &&
    value.command.repositoryId === repositoryId &&
    value.command.issueId === issueId
  );
}

export function restorePendingObjectReference(
  storage: PendingStorage,
  actorUserId: string,
  repositoryId: string,
  issueId: string,
): PendingObjectReferenceOperation | null {
  const key = pendingKey(actorUserId, repositoryId, issueId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (pendingOperation(value, actorUserId, repositoryId, issueId)) return value;
  } catch {
    // Invalid scoped state is not safe to retry.
  }
  storage.removeItem(key);
  return null;
}

export function savePendingObjectReference(
  storage: PendingStorage,
  operation: PendingObjectReferenceOperation,
) {
  if (
    !operation.actorUserId ||
    operation.command.repositoryId !== operation.repositoryId ||
    operation.command.issueId !== operation.issueId
  ) {
    throw new Error("Object reference 安全重試資訊不完整，這次操作尚未送出。");
  }
  storage.setItem(
    pendingKey(operation.actorUserId, operation.repositoryId, operation.issueId),
    JSON.stringify(operation),
  );
}

export function discardPendingObjectReference(
  storage: PendingStorage,
  operation: PendingObjectReferenceOperation,
) {
  const stored = restorePendingObjectReference(
    storage,
    operation.actorUserId,
    operation.repositoryId,
    operation.issueId,
  );
  if (stored?.command.requestId !== operation.command.requestId) return false;
  storage.removeItem(pendingKey(operation.actorUserId, operation.repositoryId, operation.issueId));
  return true;
}

export function confirmPendingObjectReference(
  storage: PendingStorage,
  operation: PendingObjectReferenceOperation,
  value: unknown,
) {
  if (
    !record(value) ||
    value.requestId !== operation.command.requestId ||
    value.repositoryId !== operation.repositoryId ||
    value.issueId !== operation.issueId ||
    value.action !== operation.command.action ||
    value.version !== operation.command.expectedVersion + 1 ||
    !Number.isSafeInteger(value.version) ||
    value.resourceId !== operation.command.objectId ||
    !record(value.data) ||
    value.data.objectId !== operation.command.objectId ||
    (operation.command.action === "set-object-reference" &&
      value.data.revisionId !== operation.command.revisionId)
  ) {
    throw new Error("Object reference 操作回執不完整，請重試原操作。");
  }
  if (!discardPendingObjectReference(storage, operation)) {
    throw new Error("Object reference 安全重試狀態已變更，請重新讀取。");
  }
  return {
    requestId: value.requestId,
    repositoryId: value.repositoryId,
    issueId: value.issueId,
    action: value.action,
    version: value.version,
    resourceId: value.resourceId,
  };
}

function errorMessage(value: unknown, fallback: string) {
  return record(value) && typeof value.error === "string" ? value.error : fallback;
}

function objectReference(value: unknown): value is IssueObjectReferenceView {
  return (
    record(value) &&
    typeof value.objectId === "string" &&
    typeof value.revisionId === "string" &&
    Number.isSafeInteger(value.pinnedVersion) &&
    typeof value.name === "string" &&
    typeof value.typeId === "string" &&
    typeof value.typeName === "string" &&
    typeof value.archived === "boolean" &&
    typeof value.currentRevisionId === "string" &&
    Number.isSafeInteger(value.currentVersion) &&
    typeof value.hasNewerRevision === "boolean"
  );
}

function availableObject(value: unknown): value is AvailableObject {
  return (
    record(value) &&
    typeof value.objectId === "string" &&
    typeof value.revisionId === "string" &&
    typeof value.typeName === "string" &&
    typeof value.name === "string" &&
    value.archived === false
  );
}

export async function requestIssueObjectReferences(
  token: string,
  repositoryId: string,
  issueId: string,
) {
  const query = new URLSearchParams({ repositoryId, issueId });
  const response = await fetch(`/api/issue-collaboration?${query}`, {
    headers: { "X-App-Session-Generation": token },
    cache: "no-store",
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(value, "Object references 讀取失敗。"));
  if (
    !record(value) ||
    value.issueId !== issueId ||
    value.repositoryId !== repositoryId ||
    !Number.isSafeInteger(value.version) ||
    !Array.isArray(value.objectReferences) ||
    !value.objectReferences.every(objectReference)
  ) {
    throw new Error("Object references 回應格式不正確。");
  }
  return {
    version: Number(value.version),
    references: value.objectReferences,
  };
}

export async function requestAvailableObjects(
  token: string,
  ownerLogin: string,
  repositoryName: string,
) {
  const items: AvailableObject[] = [];
  const seen = new Set<string>();
  let actorUserId: string | null = null;
  let repositoryId: string | null = null;
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
    if (after) query.set("after", after);
    const response = await fetch(`/api/repository-objects?${query}`, {
      headers: { "X-App-Session-Generation": token },
      cache: "no-store",
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(errorMessage(value, "Objects 讀取失敗。"));
    if (!record(value) || !record(value.repository)) {
      throw new Error("Objects 回應格式不正確。");
    }
    const next = value.next;
    if (
      typeof value.actorUserId !== "string" ||
      typeof value.repository.id !== "string" ||
      !Array.isArray(value.items) ||
      !value.items.every(availableObject) ||
      (next !== null && typeof next !== "string")
    ) {
      throw new Error("Objects 回應格式不正確。");
    }
    if (
      (actorUserId !== null && actorUserId !== value.actorUserId) ||
      (repositoryId !== null && repositoryId !== value.repository.id)
    ) {
      throw new Error("Objects 分頁 scope 已變更。");
    }
    actorUserId = value.actorUserId;
    repositoryId = value.repository.id;
    items.push(...value.items);
    after = next;
    if (after && seen.has(after)) throw new Error("Objects 分頁游標重複。");
    if (after) seen.add(after);
  } while (after);
  if (!actorUserId || !repositoryId) throw new Error("Objects scope 回應不完整。");
  return { actorUserId, repositoryId, items };
}

export async function postIssueObjectReference(token: string, command: ObjectReferenceCommand) {
  const response = await fetch("/api/issue-collaboration", {
    method: "POST",
    headers: {
      "X-App-Session-Generation": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const value: unknown = await response.json();
  return { response, value, error: errorMessage(value, "") };
}
