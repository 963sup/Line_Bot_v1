import type { IssueCommand } from "@line-work/repository/application/ports/issues";

export type PendingIssueCommand = { owner: string; command: IssueCommand };

export const legacyPendingIssueCommandKey = "repository-issue-pending-command";

function pendingIssueCommandKey(owner: string, repositoryId: string) {
  return `repository-issue-pending-command:${encodeURIComponent(owner)}:${encodeURIComponent(
    repositoryId,
  )}`;
}

function parsePendingIssueCommand(value: string | null): PendingIssueCommand | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as PendingIssueCommand;
    if (
      typeof candidate?.owner !== "string" ||
      !candidate.owner ||
      typeof candidate.command !== "object" ||
      candidate.command === null ||
      typeof candidate.command.repositoryId !== "string" ||
      !candidate.command.repositoryId
    ) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

function belongsToRepository(pending: PendingIssueCommand, owner: string, repositoryId: string) {
  return pending.owner === owner && pending.command.repositoryId === repositoryId;
}

export function savePendingIssueCommand(storage: Storage, pending: PendingIssueCommand) {
  storage.setItem(
    pendingIssueCommandKey(pending.owner, pending.command.repositoryId),
    JSON.stringify(pending),
  );
}

export function clearPendingIssueCommand(storage: Storage, pending: PendingIssueCommand) {
  const scopedKey = pendingIssueCommandKey(pending.owner, pending.command.repositoryId);
  const stored = parsePendingIssueCommand(storage.getItem(scopedKey));
  if (stored?.command.requestId !== pending.command.requestId) return false;
  storage.removeItem(scopedKey);
  return true;
}

export function restorePendingIssueCommand(storage: Storage, owner: string, repositoryId: string) {
  const scopedKey = pendingIssueCommandKey(owner, repositoryId);
  const scoped = parsePendingIssueCommand(storage.getItem(scopedKey));
  if (scoped && belongsToRepository(scoped, owner, repositoryId)) return scoped;

  const legacy = parsePendingIssueCommand(storage.getItem(legacyPendingIssueCommandKey));
  if (!legacy || !belongsToRepository(legacy, owner, repositoryId)) return null;

  storage.setItem(scopedKey, JSON.stringify(legacy));
  storage.removeItem(legacyPendingIssueCommandKey);
  return legacy;
}
