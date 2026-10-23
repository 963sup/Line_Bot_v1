/** Browser-only projection of a protected File SavedResult, not a Content plan. */
export type FileObservation = {
  id: string;
  label: string;
  value: string | null;
  source: Record<string, unknown> | null;
  uncertain: boolean;
};
export type SavedFileSource = {
  runId: string;
  revisionId: string;
  fileId: string;
  fileRevisionId: string;
  documentKind: string;
  observations: FileObservation[];
};
export type FileSourceLocator = { runId: string; revisionId: string };

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function fileSourceLocator(query: URLSearchParams): FileSourceLocator | null {
  const runId = query.get("sourceRunId");
  const revisionId = query.get("sourceRevisionId");
  return runId && revisionId && uuid.test(runId) && uuid.test(revisionId)
    ? { runId, revisionId }
    : null;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("File SavedResult 回應格式無效。");
  return Object.fromEntries(Object.entries(value));
}

/** Enforce source identity/scope at the browser boundary after the File owner's authorized read. */
export function fileSavedSource(
  response: unknown,
  expected: Readonly<{ repositoryId: string; runId: string; revisionId: string }>,
): SavedFileSource {
  const processing = record(record(response).processing);
  if (
    processing.repositoryId !== expected.repositoryId ||
    processing.runId !== expected.runId ||
    processing.revisionId !== expected.revisionId ||
    processing.state !== "SAVED" ||
    typeof processing.fileId !== "string" ||
    typeof processing.fileRevisionId !== "string" ||
    !uuid.test(processing.fileId) ||
    !uuid.test(processing.fileRevisionId)
  )
    throw new Error("File 來源不符、非 SavedResult 或版本不符，不能建立草稿。");
  const output = record(processing.savedResult);
  if (
    typeof output.documentKind !== "string" ||
    output.documentKind.length < 1 ||
    output.documentKind.length > 120 ||
    !Array.isArray(output.observations) ||
    output.observations.length < 1 ||
    output.observations.length > 500
  )
    throw new Error("File SavedResult 內容無效。");
  const seen = new Set<string>();
  const observations = output.observations.map((item): FileObservation => {
    const observation = record(item);
    if (
      typeof observation.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(observation.id) ||
      seen.has(observation.id) ||
      typeof observation.label !== "string" ||
      observation.label.length < 1 ||
      observation.label.length > 200 ||
      (observation.value !== null &&
        (typeof observation.value !== "string" || observation.value.length > 4000)) ||
      typeof observation.uncertain !== "boolean"
    )
      throw new Error("File SavedResult 項目無效。");
    seen.add(observation.id);
    const source = observation.source === null ? null : record(observation.source);
    if (source !== null && typeof source.kind !== "string")
      throw new Error("File SavedResult 來源位置無效。");
    return {
      id: observation.id,
      label: observation.label,
      value: typeof observation.value === "string" ? observation.value : null,
      source,
      uncertain: observation.uncertain,
    };
  });
  return {
    runId: expected.runId,
    revisionId: expected.revisionId,
    fileId: processing.fileId,
    fileRevisionId: processing.fileRevisionId,
    documentKind: output.documentKind,
    observations,
  };
}

export function observationCanPrefill(observation: FileObservation): boolean {
  return observation.value !== null && observation.value.length <= 2000;
}
