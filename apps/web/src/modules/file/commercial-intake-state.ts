import { type FileInfo, record, stringValue } from "./files-projection";
export type PendingCommercialIntake = {
  commandId: string;
  repositoryId: string;
  source: { fileId: string; fileRevisionId: string; sha256: string };
  target: { documentId: string; draftCommandId: string; expectedDocumentVersion: number };
};
export function newCommercialIntake(file: FileInfo): PendingCommercialIntake {
  return {
    commandId: crypto.randomUUID(),
    repositoryId: file.repositoryId,
    source: { fileId: file.fileId, fileRevisionId: file.revisionId, sha256: file.sha256 },
    target: {
      documentId: crypto.randomUUID(),
      draftCommandId: crypto.randomUUID(),
      expectedDocumentVersion: 0,
    },
  };
}
/** Only technical identity is recoverable; private extracted content is never persisted in browser storage. */
export function restoreCommercialIntake(
  raw: string | null,
  repositoryId: string,
): PendingCommercialIntake | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const p = record(JSON.parse(raw)),
      s = record(p.source),
      t = record(p.target);
    if (p.repositoryId !== repositoryId || t.expectedDocumentVersion !== 0) return null;
    const id = (value: unknown) => {
      const v = stringValue(value);
      if (!/^[a-f0-9-]{36}$/.test(v)) throw new Error();
      return v;
    };
    const sha256 = stringValue(s.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    return {
      commandId: id(p.commandId),
      repositoryId,
      source: { fileId: id(s.fileId), fileRevisionId: id(s.fileRevisionId), sha256 },
      target: {
        documentId: id(t.documentId),
        draftCommandId: id(t.draftCommandId),
        expectedDocumentVersion: 0,
      },
    };
  } catch {
    return null;
  }
}
export function commercialStatus(value: unknown, command: PendingCommercialIntake) {
  const p = record(value);
  const state = stringValue(p.state);
  if (
    !["WAITING", "ANALYZING", "RESULT_READY", "DRAFT_SAVED", "FAILED", "OUTCOME_UNKNOWN"].includes(
      state,
    ) ||
    p.commandId !== command.commandId ||
    p.documentId !== command.target.documentId
  )
    throw new Error("商務文件回應不符合原命令。");
  return state;
}

/** Only the owner's explicit absent-command response makes the original start safe to offer again. */
export function isMissingCommercialIntake(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    Reflect.get(error, "status") === 404 &&
    Reflect.get(error, "code") === "INTAKE_NOT_FOUND"
  );
}

/** Recovery controls express user intent; they never cancel or dispatch work themselves. */
export function commercialRecoveryActions(state: string, missingIntake: boolean) {
  return {
    resumeLabel:
      !missingIntake &&
      ["WAITING", "RESULT_READY", "OUTCOME_UNKNOWN", "DRAFT_SAVED"].includes(state)
        ? state === "RESULT_READY"
          ? "以已保存的解析結果重送保存"
          : "查詢並恢復原操作"
        : null,
    canAbandon:
      missingIntake || ["WAITING", "ANALYZING", "FAILED", "OUTCOME_UNKNOWN"].includes(state),
  };
}

/** Observe the current authorized saved draft without creating or resuming an analysis. */
export function observeCommercialDraft(context: {
  selected: FileInfo | null;
  pending: boolean;
  read(query: Record<string, string>): Promise<unknown>;
  onResult(revision: unknown | null): void;
  onError(error: unknown): void;
}): () => void {
  let active = true;
  const source = context.selected;
  if (!source || context.pending)
    return () => {
      active = false;
    };
  void (async () => {
    try {
      const response = record(
        await context.read({
          operation: "source",
          fileId: source.fileId,
          fileRevisionId: source.revisionId,
        }),
      );
      if (!active) return;
      const revision = response.revision;
      if (revision !== null) {
        const saved = record(revision),
          pins = record(saved.source);
        if (
          saved.repositoryId !== source.repositoryId ||
          pins.fileId !== source.fileId ||
          pins.fileRevisionId !== source.revisionId ||
          pins.sha256 !== source.sha256
        )
          throw new Error("已保存草稿與選取來源不符。");
      }
      context.onResult(revision);
    } catch (error) {
      if (active) context.onError(error);
    }
  })();
  return () => {
    active = false;
  };
}
