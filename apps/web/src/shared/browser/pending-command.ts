export type PendingFeature = "content" | "resources" | "contracts" | "executions";

export type PendingCommand = Record<string, unknown> & {
  action: string;
  repositoryId: string;
  requestId: string;
  expectedVersion: number;
};

export type PendingCommandEnvelope = {
  version: 1;
  feature: PendingFeature;
  actorUserId: string;
  repositoryId: string;
  command: PendingCommand;
};

function stringProperty(value: object, property: string) {
  const candidate = Reflect.get(value, property);
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function numberProperty(value: object, property: string) {
  const candidate = Reflect.get(value, property);
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0
    ? candidate
    : null;
}

function command(value: unknown): PendingCommand | null {
  if (!value || typeof value !== "object") return null;
  const action = stringProperty(value, "action");
  const repositoryId = stringProperty(value, "repositoryId");
  const requestId = stringProperty(value, "requestId");
  const expectedVersion = numberProperty(value, "expectedVersion");
  if (!action || !repositoryId || !requestId || expectedVersion === null) return null;
  const parsed: PendingCommand = { action, repositoryId, requestId, expectedVersion };
  for (const [key, item] of Object.entries(value)) parsed[key] = item;
  parsed.action = action;
  parsed.repositoryId = repositoryId;
  parsed.requestId = requestId;
  parsed.expectedVersion = expectedVersion;
  return parsed;
}

export function pendingCommandKey(
  feature: PendingFeature,
  actorUserId: string,
  repositoryId: string,
) {
  return `line_bot_v1:pending:${feature}:${encodeURIComponent(actorUserId)}:${encodeURIComponent(repositoryId)}`;
}

function parsePendingCommand(
  value: unknown,
  feature: PendingFeature,
  actorUserId: string,
  repositoryId: string,
): PendingCommandEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const parsed = command(Reflect.get(value, "command"));
  if (
    Reflect.get(value, "version") !== 1 ||
    Reflect.get(value, "feature") !== feature ||
    stringProperty(value, "actorUserId") !== actorUserId ||
    stringProperty(value, "repositoryId") !== repositoryId ||
    !parsed ||
    parsed.repositoryId !== repositoryId
  )
    return null;
  return { version: 1, feature, actorUserId, repositoryId, command: parsed };
}

export function persistPendingCommand(
  storage: Storage,
  feature: PendingFeature,
  actorUserId: string,
  repositoryId: string,
  value: unknown,
) {
  const parsed = command(value);
  if (!parsed || parsed.repositoryId !== repositoryId)
    throw new Error("無法安全保存操作，未送出請求。");
  const envelope: PendingCommandEnvelope = {
    version: 1,
    feature,
    actorUserId,
    repositoryId,
    command: parsed,
  };
  storage.setItem(pendingCommandKey(feature, actorUserId, repositoryId), JSON.stringify(envelope));
  return envelope;
}

export function restorePendingCommand(
  storage: Storage,
  feature: PendingFeature,
  actorUserId: string,
  repositoryId: string,
) {
  const key = pendingCommandKey(feature, actorUserId, repositoryId);
  const saved = storage.getItem(key);
  if (!saved) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(saved);
  } catch {
    storage.removeItem(key);
    return null;
  }
  const parsed = parsePendingCommand(raw, feature, actorUserId, repositoryId);
  if (!parsed) storage.removeItem(key);
  return parsed;
}

export function samePendingCommand(
  left: PendingCommandEnvelope | null,
  right: PendingCommandEnvelope,
) {
  return (
    left !== null &&
    left.version === right.version &&
    left.feature === right.feature &&
    left.actorUserId === right.actorUserId &&
    left.repositoryId === right.repositoryId &&
    left.command.requestId === right.command.requestId &&
    JSON.stringify(left.command) === JSON.stringify(right.command)
  );
}

export function acquirePendingCommandLock(lock: { current: symbol | null }) {
  if (lock.current) return null;
  const token = Symbol("pending-command");
  lock.current = token;
  return token;
}

export function releasePendingCommandLock(lock: { current: symbol | null }, token: symbol) {
  if (lock.current !== token) return false;
  lock.current = null;
  return true;
}

export function removePendingCommand(storage: Storage, pending: PendingCommandEnvelope) {
  const current = restorePendingCommand(
    storage,
    pending.feature,
    pending.actorUserId,
    pending.repositoryId,
  );
  if (!samePendingCommand(current, pending)) return false;
  storage.removeItem(pendingCommandKey(pending.feature, pending.actorUserId, pending.repositoryId));
  return true;
}

export function confirmsPendingReceipt(value: unknown, pending: PendingCommandEnvelope) {
  if (!value || typeof value !== "object") return false;
  const revision = Reflect.get(value, "revision");
  return (
    stringProperty(value, "requestId") === pending.command.requestId &&
    !!revision &&
    typeof revision === "object" &&
    stringProperty(revision, "repositoryId") === pending.repositoryId &&
    numberProperty(revision, "version") === pending.command.expectedVersion + 1
  );
}

export function shouldRetainPendingCommand(error: unknown, retry: boolean) {
  if (!(error instanceof Error) || !("status" in error)) return true;
  const status = Number(error.status);
  const code = "code" in error ? error.code : null;
  return (
    status >= 500 || code === "UNKNOWN_RESULT" || (retry && (status === 403 || status === 404))
  );
}
