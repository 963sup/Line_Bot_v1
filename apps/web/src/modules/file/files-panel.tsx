"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { Button } from "../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import { Textarea } from "../../shared/ui/textarea";

type FileInfo = {
  repositoryId: string;
  fileId: string;
  revisionId: string;
  version: number;
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
};
type Processor = { id: string; kind: "parser" | "ocr" | "ai"; version: string };
type PendingUpload = {
  requestId: string;
  fileId: string;
  revisionId: string;
  expectedVersion: number;
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
};
type RunSummary = {
  runId: string;
  fileId: string;
  fileRevisionId: string;
  state: "RUNNING" | "FAILED" | "READY" | "SAVED" | "DISCARDED";
  version: number;
  processorId: string;
  processorKind: Processor["kind"];
  at: number;
};
type Observation = {
  id: string;
  label: string;
  value: string | null;
  uncertain: boolean;
  source: { kind: string; [key: string]: unknown } | null;
};
type Output = { documentKind: string; observations: Observation[] };
type Processing = RunSummary & {
  repositoryId: string;
  revisionId: string;
  processorVersion: string;
  rawResult: Output | null;
  savedResult: Output | null;
};
type View = {
  actorUserId: string;
  repository: { id: string };
  canEdit: boolean;
  canManage: boolean;
  files: FileInfo[];
  next: string | null;
  uploadMaxBytes: number;
};
type UploadCommand = {
  repositoryId: string;
  fileId: string;
  requestId: string;
  expectedVersion: number;
  name: string;
  mediaType: string;
};
type RunCommand = {
  repositoryId: string;
  runId: string;
  requestId: string;
  expectedVersion: number;
  fileId: string;
  fileRevisionId: string;
};
type Edit =
  | { observationId: string; action: "replace"; value: string }
  | { observationId: string; action: "exclude" };
type ResultCommand = {
  repositoryId: string;
  runId: string;
  requestId: string;
  expectedVersion: number;
  action: "save" | "discard";
  edits?: Edit[];
};
type DocumentIntakeReceipt = {
  documentId: string;
  revisionId: string;
  version: number;
  intentFingerprint: string;
};
type DocumentSource = { fileId: string; fileRevisionId: string; fileSha256: string };
type DocumentIntakeRevision = {
  documentId: string;
  revisionId: string;
  version: number;
  state: "DRAFT" | "CONFIRMED";
  source: DocumentSource;
  expectedLineCount: number;
  candidate: Record<string, unknown>;
  diagnostics: string[];
};
type DocumentIntakeCommand = {
  action: "save";
  repositoryId: string;
  documentId: string;
  requestId: string;
  expectedVersion: number;
  expectedLineCount: number;
  source: { fileId: string; fileRevisionId: string; fileSha256: string };
};
type Pending =
  | { kind: "upload"; command: UploadCommand; file: File }
  | { kind: "run"; command: RunCommand; processor: string }
  | { kind: "result"; command: ResultCommand };
type EditChoice = { action: "replace"; value: string } | { action: "exclude" };
class StaleRequest extends Error {}

/** Validate unknown HTTP projections at the browser boundary; server DTOs are not trusted casts. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("File response format is invalid.");
  return Object.fromEntries(Object.entries(value));
}
function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("File response field is invalid.");
  return value;
}
function intValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("File response number is invalid.");
  return value;
}
function boolValue(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("File response boolean is invalid.");
  return value;
}
function optionalString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}
function listOf<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("File response list is invalid.");
  return value.map(parse);
}
function parseFile(value: unknown): FileInfo {
  const r = record(value);
  return {
    repositoryId: stringValue(r.repositoryId),
    fileId: stringValue(r.fileId),
    revisionId: stringValue(r.revisionId),
    version: intValue(r.version),
    name: stringValue(r.name),
    mediaType: stringValue(r.mediaType),
    byteLength: intValue(r.byteLength),
    sha256: stringValue(r.sha256),
  };
}
function parseProcessor(value: unknown): Processor {
  const r = record(value);
  const kind = stringValue(r.kind);
  if (kind !== "parser" && kind !== "ocr" && kind !== "ai")
    throw new Error("Unknown File Processor kind.");
  return { id: stringValue(r.id), kind, version: stringValue(r.version) };
}
function parseState(value: unknown): RunSummary["state"] {
  if (
    value !== "RUNNING" &&
    value !== "FAILED" &&
    value !== "READY" &&
    value !== "SAVED" &&
    value !== "DISCARDED"
  )
    throw new Error("Unknown File Processing state.");
  return value;
}
function parseRun(value: unknown): RunSummary {
  const r = record(value);
  const kind = stringValue(r.processorKind);
  if (kind !== "parser" && kind !== "ocr" && kind !== "ai")
    throw new Error("Unknown File Processing kind.");
  return {
    runId: stringValue(r.runId),
    fileId: stringValue(r.fileId),
    fileRevisionId: stringValue(r.fileRevisionId),
    state: parseState(r.state),
    version: intValue(r.version),
    processorId: stringValue(r.processorId),
    processorKind: kind,
    at: intValue(r.at),
  };
}
function parseOutput(value: unknown): Output | null {
  if (value === null) return null;
  const r = record(value);
  const observations = listOf(r.observations, (item): Observation => {
    const o = record(item);
    const source = o.source === null ? null : record(o.source);
    return {
      id: stringValue(o.id),
      label: stringValue(o.label),
      value: o.value === null ? null : stringValue(o.value),
      uncertain: boolValue(o.uncertain),
      source: source === null ? null : { ...source, kind: stringValue(source.kind) },
    };
  });
  return { documentKind: stringValue(r.documentKind), observations };
}
function parseProcessing(value: unknown): Processing {
  const r = record(value);
  return {
    ...parseRun(value),
    repositoryId: stringValue(r.repositoryId),
    revisionId: stringValue(r.revisionId),
    processorVersion: stringValue(r.processorVersion),
    rawResult: parseOutput(r.rawResult),
    savedResult: parseOutput(r.savedResult),
  };
}
function parseView(value: unknown): View {
  const r = record(value);
  const repository = record(r.repository);
  return {
    actorUserId: stringValue(r.actorUserId),
    repository: { id: stringValue(repository.id) },
    canEdit: boolValue(r.canEdit),
    canManage: boolValue(r.canManage),
    files: listOf(r.files, parseFile),
    next: optionalString(r.next),
    uploadMaxBytes: intValue(r.uploadMaxBytes),
  };
}
function parsePendingPage(value: unknown): { uploads: PendingUpload[]; next: string | null } {
  const r = record(value);
  return {
    uploads: listOf(r.uploads, (item): PendingUpload => {
      const entry = record(item);
      return {
        requestId: stringValue(entry.requestId),
        fileId: stringValue(entry.fileId),
        revisionId: stringValue(entry.revisionId),
        expectedVersion: intValue(entry.expectedVersion),
        name: stringValue(entry.name),
        mediaType: stringValue(entry.mediaType),
        byteLength: intValue(entry.byteLength),
        sha256: stringValue(entry.sha256),
      };
    }),
    next: optionalString(r.next),
  };
}
function parseRunPage(value: unknown): { runs: RunSummary[]; next: string | null } {
  const r = record(value);
  return { runs: listOf(r.runs, parseRun), next: optionalString(r.next) };
}
function parseFilePage(value: unknown): { file: FileInfo; processors: Processor[] } {
  const r = record(value);
  return { file: parseFile(r.file), processors: listOf(r.processors, parseProcessor) };
}
function parseProcessingPage(value: unknown): { processing: Processing } {
  const r = record(value);
  return { processing: parseProcessing(r.processing) };
}
function parseMutation(value: unknown): {
  requestId: string;
  file?: FileInfo;
  processing?: Processing;
} {
  const r = record(value);
  return {
    requestId: stringValue(r.requestId),
    ...(r.file === undefined ? {} : { file: parseFile(r.file) }),
    ...(r.processing === undefined ? {} : { processing: parseProcessing(r.processing) }),
  };
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "File 操作暫不可用，請重新讀取後重試。";
}

function parseDocumentIntakeReceipt(value: unknown): DocumentIntakeReceipt {
  const r = record(value);
  return {
    documentId: stringValue(r.documentId),
    revisionId: stringValue(r.revisionId),
    version: intValue(r.version),
    intentFingerprint: stringValue(r.intentFingerprint),
  };
}
function parseDocumentSource(value: unknown): DocumentSource {
  const r = record(value);
  return {
    fileId: stringValue(r.fileId),
    fileRevisionId: stringValue(r.fileRevisionId),
    fileSha256: stringValue(r.fileSha256),
  };
}
function parseDocumentIntakeRevision(value: unknown): DocumentIntakeRevision {
  const r = record(value);
  const state = stringValue(r.state);
  if (state !== "DRAFT" && state !== "CONFIRMED")
    throw new Error("ContractDocument state is invalid.");
  return {
    documentId: stringValue(r.documentId),
    revisionId: stringValue(r.id),
    version: intValue(r.version),
    state,
    source: parseDocumentSource(r.source),
    expectedLineCount: intValue(r.expectedLineCount),
    candidate: record(r.candidate),
    diagnostics: listOf(r.diagnostics, stringValue),
  };
}
function candidateLines(candidate: Record<string, unknown>) {
  return listOf(candidate.lines, (value) => {
    const line = record(value);
    return {
      sourceRowId: stringValue(line.sourceRowId),
      description: line.description === null ? null : stringValue(line.description),
      quantity: line.quantity === null ? null : stringValue(line.quantity),
      unit: line.unit === null ? null : stringValue(line.unit),
      grossAmount: line.grossAmount === null ? null : stringValue(line.grossAmount),
      sourcePages: listOf(line.sourcePages, intValue),
    };
  });
}
function sourceReviewPages(candidate: Record<string, unknown>): number[] {
  const pages = new Set<number>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = record(value);
    if (Array.isArray(object.sourcePages))
      for (const page of object.sourcePages) if (typeof page === "number") pages.add(page);
    Object.values(object).forEach(visit);
  };
  visit(candidate);
  return [...pages].sort((left, right) => left - right);
}

/** Presentation progress only; File supplies source storage while Intelligence owns ProcessingRuns. */
export function fileIntakeStep(
  hasSelectedFile: boolean,
  state: Processing["state"] | null,
): 1 | 2 | 3 | 4 {
  if (!hasSelectedFile) return 1;
  if (state === "SAVED") return 4;
  if (state === "READY") return 3;
  return 2;
}

export default function FilesPanel({
  liffId,
  ownerLogin,
  repositoryName,
  onCanManageChange,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  onCanManageChange(value: boolean): void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<FileInfo | null>(null);
  const [processors, setProcessors] = useState<Processor[]>([]);
  const [selectedProcessor, setSelectedProcessor] = useState("");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsNext, setRunsNext] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Processing | null>(null);
  const [expectedLineCount, setExpectedLineCount] = useState("");
  const [documentIntakeReceipt, setDocumentIntakeReceipt] = useState<DocumentIntakeReceipt | null>(
    null,
  );
  const [documentIntakeRevision, setDocumentIntakeRevision] =
    useState<DocumentIntakeRevision | null>(null);
  const [sourceReviewConfirmed, setSourceReviewConfirmed] = useState(false);
  const [acknowledgementReason, setAcknowledgementReason] = useState("");
  const [pendingDocumentConfirmation, setPendingDocumentConfirmation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [pendingDocumentIntake, setPendingDocumentIntake] = useState<DocumentIntakeCommand | null>(
    null,
  );
  const [edits, setEdits] = useState<Record<string, EditChoice>>({});
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [pendingUploadsNext, setPendingUploadsNext] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const mutationLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const clear = useCallback(() => {
    epoch.current++;
    mutationLock.current = false;
    setView(null);
    setSelected(null);
    setProcessors([]);
    setSelectedProcessor("");
    setRuns([]);
    setRunsNext(null);
    setProcessing(null);
    setExpectedLineCount("");
    setDocumentIntakeReceipt(null);
    setDocumentIntakeRevision(null);
    setSourceReviewConfirmed(false);
    setAcknowledgementReason("");
    setPendingDocumentConfirmation(null);
    setPendingDocumentIntake(null);
    setEdits({});
    setSourceFile(null);
    setPendingUploads([]);
    setPendingUploadsNext(null);
    setPending(null);
    setBusy(false);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
    onCanManageChange(false);
  }, [onCanManageChange]);

  const request = useCallback(
    async (query: Record<string, string> = {}, mutation?: Pending): Promise<unknown> => {
      const ticket = epoch.current;
      const session = await liffClient.ensureSession(liffId);
      if (ticket !== epoch.current) throw new StaleRequest();
      if (!session) throw new Error("請完成 LINE 登入後重試。");
      const search = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
      if (mutation && (mutation.kind === "run" || mutation.kind === "result"))
        search.set("ownerKind", "intelligence");
      if (!mutation && ["runs", "processing"].includes(query.view ?? ""))
        search.set("ownerKind", "intelligence");
      const headers: Record<string, string> = { "X-App-Session-Generation": session };
      let body: BodyInit | undefined;
      if (mutation?.kind === "upload") {
        const form = new FormData();
        form.set("command", JSON.stringify(mutation.command));
        form.set("file", mutation.file, mutation.file.name);
        body = form;
      } else if (mutation) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          operation: mutation.kind,
          command: mutation.command,
          ...(mutation.kind === "run" ? { processor: mutation.processor } : {}),
        });
      }
      const response = await fetch("/api/repository-files?" + search.toString(), {
        method: mutation ? "POST" : "GET",
        headers,
        ...(body === undefined ? {} : { body }),
        cache: "no-store",
      });
      const value: unknown =
        query.view === "download" && response.ok ? await response.blob() : await response.json();
      if (ticket !== epoch.current) throw new StaleRequest();
      if (!response.ok) {
        const message =
          value && typeof value === "object" && "error" in value && typeof value.error === "string"
            ? value.error
            : "File 請求失敗。";
        const code = value && typeof value === "object" && "code" in value ? value.code : null;
        if (response.status === 401 || response.status === 403) {
          clear();
          setError(message);
          throw new StaleRequest();
        }
        throw Object.assign(new Error(message), { status: response.status, code });
      }
      return value;
    },
    [clear, liffId, ownerLogin, repositoryName],
  );

  const requestDocumentIntake = useCallback(
    async (query: Record<string, string>, command?: object) => {
      const ticket = epoch.current;
      const session = await liffClient.ensureSession(liffId);
      if (ticket !== epoch.current) throw new StaleRequest();
      if (!session) throw new Error("請完成 LINE 登入後重試。");
      const search = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
      const response = await fetch(`/api/repository-document-intake?${search}`, {
        method: command ? "POST" : "GET",
        headers: {
          ...(command ? { "Content-Type": "application/json" } : {}),
          "X-App-Session-Generation": session,
        },
        ...(command ? { body: JSON.stringify(command) } : {}),
        cache: "no-store",
      });
      const value: unknown = await response.json();
      if (ticket !== epoch.current) throw new StaleRequest();
      if (!response.ok) {
        const message =
          value && typeof value === "object" && "error" in value && typeof value.error === "string"
            ? value.error
            : query.operation === "read"
              ? "ContractDocument 讀取失敗。"
              : "採購單操作失敗。";
        if (response.status === 401 || response.status === 403) {
          clear();
          setError(message);
          throw new StaleRequest();
        }
        throw Object.assign(new Error(message), { status: response.status });
      }
      return value;
    },
    [clear, liffId, ownerLogin, repositoryName],
  );

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const [filePage, uploadsPage] = await Promise.all([request(), request({ view: "uploads" })]);
      const page = parseView(filePage);
      const uploads = parsePendingPage(uploadsPage);
      if (ticket !== epoch.current) return;
      setView(page);
      setPendingUploads(uploads.uploads);
      setPendingUploadsNext(uploads.next);
      onCanManageChange(page.canManage);
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }, [request, onCanManageChange]);

  useEffect(() => {
    const unsubscribe = liffClient.onSessionBlocked(clear);
    const visibility = () => {
      if (document.visibilityState === "hidden") clear();
      else void load();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", clear);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [clear, load]);

  async function listPendingUploads(after: string) {
    const page = parsePendingPage(await request({ view: "uploads", after }));
    setPendingUploads((current) => [
      ...current,
      ...page.uploads.filter(
        (upload) => !current.some((item) => item.requestId === upload.requestId),
      ),
    ]);
    setPendingUploadsNext(page.next);
  }

  async function listRuns(fileId: string, after?: string) {
    const page = parseRunPage(
      await request({
        view: "runs",
        fileId,
        ...(after ? { after } : {}),
      }),
    );
    if (after) {
      setRuns((current) => [
        ...current,
        ...page.runs.filter((run) => !current.some((item) => item.runId === run.runId)),
      ]);
    } else {
      setRuns(page.runs);
    }
    setRunsNext(page.next);
  }

  async function openFile(file: FileInfo) {
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const [current, history] = await Promise.all([
        request({ view: "file", fileId: file.fileId }),
        request({ view: "runs", fileId: file.fileId }),
      ]);
      if (ticket !== epoch.current) return;
      const data = parseFilePage(current);
      const previous = parseRunPage(history);
      setSelected(data.file);
      setProcessors(data.processors);
      setSelectedProcessor(data.processors[0]?.id ?? "");
      setExpectedLineCount("");
      setDocumentIntakeReceipt(null);
      setDocumentIntakeRevision(null);
      setSourceReviewConfirmed(false);
      setAcknowledgementReason("");
      setPendingDocumentConfirmation(null);
      setRuns(previous.runs);
      setRunsNext(previous.next);
      setProcessing(null);
      setEdits({});
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }

  async function openRun(runId: string) {
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const result = parseProcessingPage(await request({ view: "processing", runId }));
      if (ticket !== epoch.current) return;
      setProcessing(result.processing);
      setEdits({});
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }

  async function send(next: Pending) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const response = parseMutation(await request({}, next));
      if (ticket !== epoch.current) return;
      if (response.requestId !== next.command.requestId)
        throw new Error("File receipt 尚未確認，請使用原命令重試。");
      setPending(null);
      if (next.kind === "upload") {
        if (!response.file) throw new Error("File revision 尚未確認。");
        setSourceFile(null);
        if (fileInput.current) fileInput.current.value = "";
        await load();
        await openFile(response.file);
      } else {
        if (!response.processing) throw new Error("Processing revision 尚未確認。");
        let current = response.processing;
        if (current.state === "RUNNING") {
          const read = parseProcessingPage(
            await request({ view: "processing", runId: current.runId }),
          );
          current = read.processing;
        }
        if (ticket !== epoch.current) return;
        setProcessing(current);
        setEdits({});
        if (selected) await listRuns(selected.fileId);
      }
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      const status =
        cause !== null && typeof cause === "object" && "status" in cause
          ? Number(cause.status)
          : 503;
      if (status < 500 && status !== 429) setPending(null);
      if (status === 401 || status === 403) clear();
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) {
        setBusy(false);
        mutationLock.current = false;
      }
    }
  }

  function resumeUpload(intent: PendingUpload) {
    if (!view?.canEdit || !sourceFile || pending || busy) return;
    const mediaType = sourceFile.type || "application/octet-stream";
    if (
      sourceFile.name.trim() !== intent.name ||
      sourceFile.size !== intent.byteLength ||
      mediaType !== intent.mediaType
    ) {
      setError("請重新選擇與待完成上傳相同的原始 File；Server 將再比對 SHA-256。");
      return;
    }
    const next: Pending = {
      kind: "upload",
      file: sourceFile,
      command: {
        repositoryId: view.repository.id,
        fileId: intent.fileId,
        requestId: intent.requestId,
        expectedVersion: intent.expectedVersion,
        name: sourceFile.name,
        mediaType,
      },
    };
    setPending(next);
    void send(next);
  }

  function upload() {
    if (!view?.canEdit || !sourceFile || pending) return;
    if (!sourceFile.size || sourceFile.size > view.uploadMaxBytes) {
      setError("Browser Upload 上限為 3 MB；更大的檔案目前請使用受保護的 File CLI。");
      return;
    }
    const next: Pending = {
      kind: "upload",
      file: sourceFile,
      command: {
        repositoryId: view.repository.id,
        fileId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        expectedVersion: 0,
        name: sourceFile.name,
        mediaType: sourceFile.type || "application/octet-stream",
      },
    };
    setPending(next);
    void send(next);
  }

  function run() {
    if (!view?.canEdit || !selected || pending) return;
    if (!selectedProcessor || !processors.some((method) => method.id === selectedProcessor)) {
      setError("目前檔案沒有可用的 Processor。");
      return;
    }
    const next: Pending = {
      kind: "run",
      processor: selectedProcessor,
      command: {
        repositoryId: view.repository.id,
        runId: crypto.randomUUID(),
        fileId: selected.fileId,
        fileRevisionId: selected.revisionId,
        requestId: crypto.randomUUID(),
        expectedVersion: 0,
      },
    };
    setPending(next);
    void send(next);
  }

  async function intakePurchaseOrder(command: DocumentIntakeCommand) {
    if (!view?.canEdit || pending || busy) return;
    setPendingDocumentIntake(command);
    setBusy(true);
    setError("");
    try {
      const receipt = parseDocumentIntakeReceipt(
        await requestDocumentIntake({ operation: "intake" }, command),
      );
      const revision = parseDocumentIntakeRevision(
        record(
          await requestDocumentIntake({
            operation: "read",
            documentId: receipt.documentId,
            revisionId: receipt.revisionId,
          }),
        ).revision,
      );
      setDocumentIntakeReceipt(receipt);
      setDocumentIntakeRevision(revision);
      setSourceReviewConfirmed(false);
      setAcknowledgementReason("");
      setPendingDocumentConfirmation(null);
      setPendingDocumentIntake(null);
    } catch (cause) {
      if (cause instanceof StaleRequest) return;
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPurchaseOrder() {
    if (!view?.canEdit || !documentIntakeReceipt || !documentIntakeRevision || busy || pending)
      return;
    if (documentIntakeRevision.state !== "DRAFT") return;
    if (!sourceReviewConfirmed) {
      setError("請先逐行核對原始檔，再確認 ContractDocument。");
      return;
    }
    const lines = candidateLines(documentIntakeRevision.candidate);
    const reviewedSourcePages = sourceReviewPages(documentIntakeRevision.candidate);
    if (
      lines.length !== documentIntakeRevision.expectedLineCount ||
      reviewedSourcePages.length === 0
    ) {
      setError("候選資料缺少完整行數或來源頁，不能確認。");
      return;
    }
    const command =
      pendingDocumentConfirmation ??
      (() => {
        const financialDiagnostic = documentIntakeRevision.diagnostics.some((item) =>
          item.includes("MISMATCH"),
        );
        if (financialDiagnostic && !acknowledgementReason.trim()) {
          setError("存在金額差異，請填寫明確的差異確認理由。");
          return null;
        }
        return {
          action: "confirm",
          repositoryId: view.repository.id,
          documentId: documentIntakeRevision.documentId,
          requestId: crypto.randomUUID(),
          intentFingerprint: documentIntakeReceipt.intentFingerprint,
          expectedVersion: documentIntakeRevision.version,
          expectedLineCount: documentIntakeRevision.expectedLineCount,
          source: documentIntakeRevision.source,
          candidate: documentIntakeRevision.candidate,
          sourceReviewAttestation: {
            verifiedLineCount: lines.length,
            reviewedSourcePages,
            reviewedSourceRowIds: lines.map((line) => line.sourceRowId),
            confirmedFromOriginal: true,
          },
          ...(financialDiagnostic
            ? { acknowledgement: { reason: acknowledgementReason.trim() } }
            : {}),
        };
      })();
    if (!command) return;
    setPendingDocumentConfirmation(command);
    setBusy(true);
    setError("");
    try {
      const receipt = parseDocumentIntakeReceipt(
        await requestDocumentIntake(
          { operation: "contract", documentId: documentIntakeRevision.documentId },
          command,
        ),
      );
      const revision = parseDocumentIntakeRevision(
        record(
          await requestDocumentIntake({
            operation: "read",
            documentId: receipt.documentId,
            revisionId: receipt.revisionId,
          }),
        ).revision,
      );
      setDocumentIntakeReceipt(receipt);
      setDocumentIntakeRevision(revision);
      setSourceReviewConfirmed(false);
      setPendingDocumentConfirmation(null);
    } catch (cause) {
      if (cause instanceof StaleRequest) return;
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function startPurchaseOrderIntake() {
    if (!view?.canEdit || !selected || pending || busy) return;
    const lineCount = Number(expectedLineCount);
    if (!Number.isSafeInteger(lineCount) || lineCount < 1) {
      setError("請輸入原始採購單標示的正確行數。");
      return;
    }
    void intakePurchaseOrder({
      action: "save",
      repositoryId: view.repository.id,
      documentId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      expectedVersion: 0,
      expectedLineCount: lineCount,
      source: {
        fileId: selected.fileId,
        fileRevisionId: selected.revisionId,
        fileSha256: selected.sha256,
      },
    });
  }

  async function retryRun(historical: Processing) {
    if (!view?.canEdit || !selected || pending || busy) return;
    if (historical.fileId !== selected.fileId) {
      setError("歷史 Run 與目前選定的 File 不相符。");
      return;
    }
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    let next: Pending | null = null;
    try {
      const page = parseFilePage(
        await request({
          view: "file",
          fileId: historical.fileId,
          revisionId: historical.fileRevisionId,
        }),
      );
      if (ticket !== epoch.current) return;
      const method = page.processors.find(
        (processor) =>
          processor.id === historical.processorId &&
          processor.kind === historical.processorKind &&
          processor.version === historical.processorVersion,
      );
      if (!method || page.file.revisionId !== historical.fileRevisionId) {
        setError(
          "原始 Revision 的 Processor 或版本已不可用；可明確建立新 Run，但不能改寫歷史 Run。",
        );
        return;
      }
      next = {
        kind: "run",
        processor: method.id,
        command: {
          repositoryId: view.repository.id,
          runId: historical.runId,
          fileId: historical.fileId,
          fileRevisionId: historical.fileRevisionId,
          requestId: crypto.randomUUID(),
          expectedVersion: historical.version,
        },
      };
    } catch (cause) {
      if (!(cause instanceof StaleRequest) && ticket === epoch.current)
        setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
    if (next && ticket === epoch.current) {
      setPending(next);
      void send(next);
    }
  }

  function finish(action: "save" | "discard") {
    if (!view?.canEdit || !processing || processing.state !== "READY" || pending) return;
    const changes: Edit[] =
      action === "save"
        ? Object.entries(edits).map(([observationId, edit]) =>
            edit.action === "exclude"
              ? { observationId, action: "exclude" }
              : { observationId, action: "replace", value: edit.value },
          )
        : [];
    const next: Pending = {
      kind: "result",
      command: {
        repositoryId: view.repository.id,
        runId: processing.runId,
        requestId: crypto.randomUUID(),
        expectedVersion: processing.version,
        action,
        ...(action === "save" ? { edits: changes } : {}),
      },
    };
    setPending(next);
    void send(next);
  }

  async function download() {
    if (!selected) return;
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const blob = await request({
        view: "download",
        fileId: selected.fileId,
        revisionId: selected.revisionId,
      });
      if (!(blob instanceof Blob)) throw new Error("File download response is invalid.");
      if (ticket !== epoch.current) return;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = selected.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }

  const raw = processing?.rawResult ?? null;
  const saved = processing?.savedResult ?? null;
  const editable = view?.canEdit && processing?.state === "READY" && !!raw && !pending && !busy;
  const currentStep = fileIntakeStep(selected !== null, processing?.state ?? null);

  return (
    <div className="grid gap-4 p-4 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <ol
        aria-label="File 處理步驟"
        className="col-span-full grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"
      >
        {["上傳原始檔", "固定處理", "預覽與修正", "儲存結果"].map((title, index) => (
          <li
            key={title}
            aria-current={index + 1 === currentStep ? "step" : undefined}
            className={
              index + 1 === currentStep
                ? "rounded-md border border-primary px-3 py-2 font-medium"
                : "rounded-md border border-transparent px-3 py-2 text-muted-foreground"
            }
          >
            {index + 1}. {title}
          </li>
        ))}
      </ol>
      <Card>
        <CardHeader>
          <CardTitle>Repository Files</CardTitle>
          <CardDescription>只列出目前 Repository 中已提交的原始檔案。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label htmlFor="repository-file">上傳原始檔案</Label>
          <Input
            ref={fileInput}
            id="repository-file"
            type="file"
            disabled={!view?.canEdit || busy || !!pending}
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Web 單檔上限 {view ? (view.uploadMaxBytes / 1_000_000).toFixed(0) : "3"} MB。
            上傳只保存來源，不執行 Parser、OCR、AI 或 Save。
          </p>
          <Button disabled={!view?.canEdit || !sourceFile || busy || !!pending} onClick={upload}>
            Upload
          </Button>
          {pendingUploads.length > 0 && (
            <div className="grid gap-2 rounded-lg border p-3" aria-label="Pending Uploads">
              <p className="text-sm font-medium">待完成的上傳（只限本人）</p>
              <p className="text-xs text-muted-foreground">
                關閉畫面或網路中斷後，原始 RequestId 仍由 File Owner 保存。
                請在上方重新選擇相同原始檔，再明確恢復；不會自動上傳。
              </p>
              {pendingUploads.map((intent) => (
                <div key={intent.requestId} className="grid gap-1 border-t pt-2">
                  <p className="text-sm">
                    {intent.name} · {Math.ceil(intent.byteLength / 1024)} KB
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!view?.canEdit || !sourceFile || busy || !!pending}
                    onClick={() => resumeUpload(intent)}
                  >
                    使用原 RequestId 恢復上傳
                  </Button>
                </div>
              ))}
              {pendingUploadsNext && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !!pending}
                  onClick={() => void listPendingUploads(pendingUploadsNext)}
                >
                  載入更多待完成上傳
                </Button>
              )}
            </div>
          )}
          {view?.files.length ? (
            <div className="grid gap-2" aria-label="File List">
              {view.files.map((file) => (
                <Button
                  key={file.fileId}
                  variant="outline"
                  className="h-auto justify-start whitespace-normal text-left"
                  disabled={busy || !!pending}
                  onClick={() => void openFile(file)}
                >
                  {file.name} · v{file.version} · {Math.ceil(file.byteLength / 1024)} KB
                </Button>
              ))}
            </div>
          ) : (
            !busy &&
            view && <p className="text-sm text-muted-foreground">此 Repository 尚無 File。</p>
          )}
          {view?.next && (
            <Button
              variant="outline"
              disabled={busy || !!pending}
              onClick={() =>
                void (async () => {
                  const ticket = epoch.current;
                  setBusy(true);
                  try {
                    const page = parseView(await request({ after: view.next ?? "" }));
                    if (ticket !== epoch.current) return;
                    setView((current) =>
                      current
                        ? {
                            ...current,
                            files: [
                              ...current.files,
                              ...page.files.filter(
                                (file) =>
                                  !current.files.some((item) => item.fileId === file.fileId),
                              ),
                            ],
                            next: page.next,
                          }
                        : current,
                    );
                  } catch (cause) {
                    if (!(cause instanceof StaleRequest)) setError(errorMessage(cause));
                  } finally {
                    if (ticket === epoch.current) setBusy(false);
                  }
                })()
              }
            >
              載入更多 Files
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.name : "選擇 File"}</CardTitle>
          <CardDescription>原始檔保存、固定採購單解析，或一般檔案預覽。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {busy && <p role="status">File 操作中…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {pending && (
            <div className="grid gap-2">
              <p className="text-sm">
                操作結果尚未確認，保留原 RequestId；重試不會建立另一個命令。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void send(pending)}>
                  原命令重試
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setPending(null);
                    setError("已放棄瀏覽器原命令；請先重新查詢正式狀態。");
                  }}
                >
                  放棄重送
                </Button>
              </div>
            </div>
          )}
          {selected && (
            <>
              <p className="text-sm text-muted-foreground">
                Revision {selected.version} · {selected.mediaType} · {selected.byteLength} bytes
              </p>
              <Button
                variant="outline"
                disabled={busy || !!pending || selected.byteLength > (view?.uploadMaxBytes ?? 0)}
                onClick={() => void download()}
              >
                Download 原始檔
              </Button>
              {selected.byteLength > (view?.uploadMaxBytes ?? 0) && (
                <p className="text-xs text-muted-foreground">
                  大型原始檔案須經受保護的 File CLI 下載；Web 傳輸上限 3 MB。
                </p>
              )}
              {view?.canEdit && (
                <>
                  {processors.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      此格式目前只有原始檔保存功能，尚無可用的 Processor。
                    </p>
                  )}
                  {processors.length > 0 && (
                    <Button disabled={busy || !!pending} onClick={() => run()}>
                      開始一般檔案預覽
                    </Button>
                  )}
                  <div className="grid gap-2 rounded-md border p-3">
                    <div>
                      <Label htmlFor="document-line-count">採購單來源行數</Label>
                      <p className="text-xs text-muted-foreground">
                        系統會固定使用 ContractDocument 結構化解析；行數只作為完整性核對輸入。
                      </p>
                    </div>
                    <Input
                      id="document-line-count"
                      inputMode="numeric"
                      min={1}
                      placeholder="例如 54"
                      value={expectedLineCount}
                      disabled={busy || !!pending}
                      onChange={(event) => setExpectedLineCount(event.target.value)}
                    />
                    <Button
                      disabled={busy || !!pending || !expectedLineCount}
                      onClick={() => startPurchaseOrderIntake()}
                    >
                      解析採購單並建立待審草稿
                    </Button>
                    {pendingDocumentIntake && (
                      <Button
                        variant="outline"
                        disabled={busy || !!pending}
                        onClick={() => void intakePurchaseOrder(pendingDocumentIntake)}
                      >
                        重試原採購單命令
                      </Button>
                    )}
                    {documentIntakeReceipt && (
                      <p className="text-xs text-muted-foreground">
                        草稿已保存：Revision v{documentIntakeReceipt.version}
                        ，下方可直接檢視並確認。
                      </p>
                    )}
                  </div>
                  {documentIntakeRevision && (
                    <div className="grid gap-3 rounded-md border p-3">
                      <div>
                        <p className="font-medium">ContractDocument Review</p>
                        <p className="text-xs text-muted-foreground">
                          {documentIntakeRevision.state === "CONFIRMED"
                            ? "此版本已由 Contract 明確確認。"
                            : `候選 v${documentIntakeRevision.version} · ${candidateLines(documentIntakeRevision.candidate).length} 行 · 預期 ${documentIntakeRevision.expectedLineCount} 行`}
                        </p>
                      </div>
                      {documentIntakeRevision.diagnostics.length > 0 && (
                        <p className="text-sm text-destructive">
                          診斷：{documentIntakeRevision.diagnostics.join("、")}
                        </p>
                      )}
                      <div className="grid gap-2">
                        {candidateLines(documentIntakeRevision.candidate).map((line) => (
                          <div key={line.sourceRowId} className="rounded border p-2 text-sm">
                            <p>
                              {line.sourceRowId} · {line.description ?? "未提供品項描述"}
                            </p>
                            <p className="text-muted-foreground">
                              {line.quantity ?? "—"} {line.unit ?? ""} · 毛額{" "}
                              {line.grossAmount ?? "—"} · 來源頁{" "}
                              {line.sourcePages.join(", ") || "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                      {documentIntakeRevision.state === "DRAFT" && (
                        <>
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={sourceReviewConfirmed}
                              disabled={busy || !!pending}
                              onChange={(event) => setSourceReviewConfirmed(event.target.checked)}
                            />
                            <span>
                              我已逐行對照原始檔、來源頁與金額，確認以上候選資料可送出 Contract
                              確認。
                            </span>
                          </label>
                          {documentIntakeRevision.diagnostics.some((item) =>
                            item.includes("MISMATCH"),
                          ) && (
                            <Input
                              placeholder="金額差異確認理由"
                              value={acknowledgementReason}
                              disabled={busy || !!pending}
                              onChange={(event) => setAcknowledgementReason(event.target.value)}
                            />
                          )}
                          <Button
                            disabled={busy || !!pending || !sourceReviewConfirmed}
                            onClick={() => void confirmPurchaseOrder()}
                          >
                            確認 ContractDocument
                          </Button>
                          {pendingDocumentConfirmation && (
                            <Button
                              variant="outline"
                              disabled={busy || !!pending}
                              onClick={() => void confirmPurchaseOrder()}
                            >
                              重試原確認命令
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <div className="grid gap-2">
                <Label>Processing History</Label>
                {runs.map((item) => (
                  <Button
                    key={item.runId}
                    variant="outline"
                    className="h-auto justify-start whitespace-normal text-left"
                    disabled={busy || !!pending}
                    onClick={() => void openRun(item.runId)}
                  >
                    {item.processorId} · {item.state} · v{item.version}
                  </Button>
                ))}
                {runs.length === 0 && (
                  <p className="text-sm text-muted-foreground">尚無處理紀錄。</p>
                )}
                {runsNext && (
                  <Button
                    variant="outline"
                    disabled={busy || !!pending}
                    onClick={() => void listRuns(selected.fileId, runsNext)}
                  >
                    載入更多 Runs
                  </Button>
                )}
              </div>
            </>
          )}

          {processing && (
            <div className="grid gap-3">
              <p className="text-sm">
                Run：{processing.processorId} · {processing.state}
              </p>
              {(processing.state === "RUNNING" || processing.state === "FAILED") && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || !!pending}
                    onClick={() => void openRun(processing.runId)}
                  >
                    重新查詢狀態
                  </Button>
                  {view?.canEdit && (
                    <Button
                      disabled={busy || !!pending || !view?.canEdit}
                      onClick={() => void retryRun(processing)}
                    >
                      明確重試相同 Processor
                    </Button>
                  )}
                </div>
              )}
              {(processing.state === "READY" || processing.state === "SAVED") && (
                <div className="grid gap-2">
                  <p className="text-sm text-muted-foreground">
                    RawResult 為處理器輸出的未驗證資料；Edit 只會在 Save 時提交。
                  </p>
                  <p className="font-medium">
                    {saved ? "SavedResult" : "Preview"} · {raw?.documentKind ?? saved?.documentKind}
                  </p>
                  {(saved ?? raw)?.observations.map((observation) => {
                    const edit = edits[observation.id];
                    const excluded = edit?.action === "exclude";
                    const value =
                      edit?.action === "replace" ? edit.value : (observation.value ?? "");
                    return (
                      <div key={observation.id} className="grid gap-2 rounded-lg border p-3">
                        <Label htmlFor={"observation-" + observation.id}>
                          {observation.label}
                          {observation.uncertain ? " · 未確認" : ""}
                        </Label>
                        <Textarea
                          id={"observation-" + observation.id}
                          value={value}
                          disabled={!editable || excluded}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [observation.id]: { action: "replace", value: event.target.value },
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          來源：{observation.source ? JSON.stringify(observation.source) : "未定位"}
                        </p>
                        {editable && (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={excluded}
                              onChange={(event) =>
                                setEdits((current) => {
                                  const next = { ...current };
                                  if (event.target.checked)
                                    next[observation.id] = { action: "exclude" };
                                  else delete next[observation.id];
                                  return next;
                                })
                              }
                            />
                            不納入 SavedResult
                          </label>
                        )}
                      </div>
                    );
                  })}
                  {editable && (
                    <div className="flex gap-2">
                      <Button disabled={busy} onClick={() => finish("save")}>
                        Save
                      </Button>
                      <Button variant="outline" disabled={busy} onClick={() => finish("discard")}>
                        Discard
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {processing.state === "SAVED" && (
                <div className="grid gap-1 rounded-lg border p-3 text-sm" role="status">
                  <p className="font-medium">File 解析結果已保存</p>
                  <p className="text-muted-foreground">
                    此結果是 Intelligence-owned 候選資料，不會自動建立 Contract 或 Content。請在
                    Contract 確認完整結構化文件，再由 Content 擴展該確認版本，最後供 WBS 投影使用。
                  </p>
                </div>
              )}
              {processing.state === "DISCARDED" && (
                <p className="text-sm text-muted-foreground">
                  此 Run 已 Discard，沒有 SavedResult；原始 RawResult 仍保留於歷史。
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
