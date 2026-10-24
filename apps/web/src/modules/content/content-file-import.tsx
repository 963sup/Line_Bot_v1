"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { Button } from "../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import { NativeSelect, NativeSelectOption } from "../../shared/ui/native-select";
import { Textarea } from "../../shared/ui/textarea";

type FileOption = { fileId: string; name: string };

const sourceUuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function pinnedSavedFileSource(query: URLSearchParams) {
  const runId = query.get("sourceRunId");
  const revisionId = query.get("sourceRevisionId");
  return runId && revisionId && sourceUuid.test(runId) && sourceUuid.test(revisionId)
    ? { runId, revisionId }
    : null;
}
type RunOption = { runId: string; state: string; processorId: string };
type Observation = {
  id: string;
  label: string;
  value: string | null;
  uncertain: boolean;
  source: unknown;
};
type SavedRun = {
  runId: string;
  revisionId: string;
  state: string;
  savedResult: { observations: Observation[] } | null;
};
type Parent = { id: string; title: string; kind: string };
type Measure = { id: string; name: string; unit: string };

export type FileContentImportDraft = Readonly<{
  source: { runId: string; processingRevisionId: string; observationId: string };
  target: {
    parentId: string;
    kind: "WORK" | "TASK";
    title: string;
    body: string;
    measureId: string;
    quantity: string;
    newMeasure?: { name: string; subject: string; unit: string };
  };
}>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("File reference response is invalid.");
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("File reference field is invalid.");
  return value;
}
function optional(value: unknown): string | null {
  return value === null ? null : text(value);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("File reference list is invalid.");
  return value;
}

export default function ContentFileImport({
  liffId,
  ownerLogin,
  repositoryName,
  parents,
  measures,
  disabled,
  onImport,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  parents: readonly Parent[];
  measures: readonly Measure[];
  disabled: boolean;
  onImport(value: FileContentImportDraft): Promise<void>;
}) {
  const [files, setFiles] = useState<FileOption[]>([]);
  const [pinnedSource, setPinnedSource] = useState<{
    runId: string;
    revisionId: string;
  } | null>(null);
  const [filesNext, setFilesNext] = useState<string | null>(null);
  const [fileId, setFileId] = useState("");
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [runsNext, setRunsNext] = useState<string | null>(null);
  const [run, setRun] = useState<SavedRun | null>(null);
  const [observationId, setObservationId] = useState("");
  const [kind, setKind] = useState<"WORK" | "TASK">("WORK");
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [quantity, setQuantity] = useState("");
  const [measureId, setMeasureId] = useState("");
  const [createMeasure, setCreateMeasure] = useState(false);
  const [measureName, setMeasureName] = useState("");
  const [measureSubject, setMeasureSubject] = useState("");
  const [measureUnit, setMeasureUnit] = useState("SET");
  const [confirmedDisclosure, setConfirmedDisclosure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const selectionEpoch = useRef(0);
  const request = useCallback(
    async (query: Record<string, string>): Promise<Record<string, unknown>> => {
      const ticket = epoch.current;
      const session = await liffClient.ensureSession(liffId);
      if (ticket !== epoch.current) throw new Error("Outdated File selection.");
      if (!session) throw new Error("請先完成 LINE 登入。");
      const url = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
      const response = await fetch(`/api/repository-files?${url}`, {
        cache: "no-store",
        headers: { "X-App-Session-Generation": session },
      });
      const result: unknown = await response.json();
      if (ticket !== epoch.current) throw new Error("Outdated File selection.");
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          epoch.current++;
          selectionEpoch.current++;
          setFiles([]);
          setFilesNext(null);
          setFileId("");
          setRuns([]);
          setRunsNext(null);
          setRun(null);
          setObservationId("");
          setConfirmedDisclosure(false);
          setError("受保護的 File 存取權限已失效，請重新載入。");
          throw new Error("Outdated File authorization.");
        }
        const failure = object(result);
        throw new Error(typeof failure.error === "string" ? failure.error : "File 無法讀取。");
      }
      return object(result);
    },
    [liffId, ownerLogin, repositoryName],
  );
  const loadFiles = useCallback(
    async (after?: string) => {
      const ticket = epoch.current;
      setBusy(true);
      try {
        const page = await request(after ? { after } : {});
        if (ticket !== epoch.current) return;
        const options = array(page.files).map((value): FileOption => {
          const file = object(value);
          return { fileId: text(file.fileId), name: text(file.name) };
        });
        setFiles((current) => (after ? [...current, ...options] : options));
        setFilesNext(optional(page.next));
      } catch (cause) {
        if (ticket === epoch.current)
          setError(cause instanceof Error ? cause.message : "File 清單無法讀取。");
      } finally {
        if (ticket === epoch.current) setBusy(false);
      }
    },
    [request],
  );
  useEffect(() => {
    setPinnedSource(pinnedSavedFileSource(new URLSearchParams(globalThis.window.location.search)));
    void loadFiles();
    return () => {
      epoch.current++;
    };
  }, [loadFiles]);

  async function openFile(nextId: string, after?: string) {
    const ticket = epoch.current;
    const selectionTicket = after ? selectionEpoch.current : ++selectionEpoch.current;
    if (!after) {
      setFileId(nextId);
      setRuns([]);
      setRunsNext(null);
      setRun(null);
      setObservationId("");
      setConfirmedDisclosure(false);
    }
    if (!nextId) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const page = await request({ view: "runs", fileId: nextId, ...(after ? { after } : {}) });
      if (ticket !== epoch.current || selectionTicket !== selectionEpoch.current) return;
      const options = array(page.runs).map((value): RunOption => {
        const item = object(value);
        return {
          runId: text(item.runId),
          state: text(item.state),
          processorId: text(item.processorId),
        };
      });
      setRuns((current) => (after ? [...current, ...options] : options));
      setRunsNext(optional(page.next));
    } catch (cause) {
      if (ticket === epoch.current && selectionTicket === selectionEpoch.current)
        setError(cause instanceof Error ? cause.message : "處理紀錄無法讀取。");
    } finally {
      if (ticket === epoch.current && selectionTicket === selectionEpoch.current) setBusy(false);
    }
  }
  async function openRun(runId: string, exactRevision?: string) {
    const ticket = epoch.current;
    const selectionTicket = ++selectionEpoch.current;
    setRun(null);
    setObservationId("");
    setConfirmedDisclosure(false);
    if (!runId) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request({
        view: "processing",
        runId,
        ...(exactRevision ? { revisionId: exactRevision } : {}),
      });
      if (ticket !== epoch.current || selectionTicket !== selectionEpoch.current) return;
      const processing = object(result.processing);
      if (
        processing.runId !== runId ||
        (exactRevision ? processing.revisionId !== exactRevision : processing.fileId !== fileId)
      )
        throw new Error("Selected File ProcessingRun does not match the expected source.");
      if (processing.state !== "SAVED" || processing.savedResult === null)
        throw new Error("只有已明確 Save 的 File 處理結果才能建立 Content。");
      const saved = object(processing.savedResult);
      const observations = array(saved.observations).map((value): Observation => {
        const observation = object(value);
        return {
          id: text(observation.id),
          label: text(observation.label),
          value: optional(observation.value),
          uncertain: observation.uncertain === true,
          source: observation.source,
        };
      });
      if (exactRevision) setFileId(text(processing.fileId));
      setRun({
        runId: text(processing.runId),
        revisionId: text(processing.revisionId),
        state: text(processing.state),
        savedResult: { observations },
      });
    } catch (cause) {
      if (ticket === epoch.current && selectionTicket === selectionEpoch.current)
        setError(cause instanceof Error ? cause.message : "SavedResult 無法讀取。");
    } finally {
      if (ticket === epoch.current && selectionTicket === selectionEpoch.current) setBusy(false);
    }
  }

  const candidates = parents.filter((p) => p.kind === (kind === "WORK" ? "SUBOBJECT" : "WORK"));
  const observation = run?.savedResult?.observations.find((o) => o.id === observationId);
  const allowed =
    !disabled &&
    !busy &&
    !!run &&
    !!observation &&
    observation.value !== null &&
    !!parentId &&
    candidates.some((p) => p.id === parentId) &&
    !!title.trim() &&
    !!quantity.trim() &&
    (createMeasure
      ? !!measureName.trim() && !!measureSubject.trim() && !!measureUnit.trim()
      : measures.some((m) => m.id === measureId)) &&
    confirmedDisclosure;

  async function confirm() {
    if (!allowed || !run || !observation) return;
    setBusy(true);
    setError("");
    try {
      await onImport({
        source: {
          runId: run.runId,
          processingRevisionId: run.revisionId,
          observationId: observation.id,
        },
        target: {
          parentId,
          kind,
          title: title.trim(),
          body,
          measureId: createMeasure ? "" : measureId,
          quantity: quantity.trim(),
          ...(createMeasure
            ? {
                newMeasure: {
                  name: measureName.trim(),
                  subject: measureSubject.trim(),
                  unit: measureUnit.trim(),
                },
              }
            : {}),
        },
      });
      setConfirmedDisclosure(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法開始 Content 匯入。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>從 File SavedResult 建立 Content</CardTitle>
        <CardDescription>
          選擇已保存的觀測值，再由使用者指定 Work／Task、計畫數量及單位。 這是一次明確的 Content
          寫入，不會自動產生合約或 Project WBS。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {disabled && (
          <p className="text-sm text-muted-foreground">
            請先保存或重新載入 Content 手動草稿，完成其他待確認命令後再匯入。
          </p>
        )}
        {pinnedSource && (
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            <p>從 File 帶來的 SAVED Run：{pinnedSource.runId}</p>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void openRun(pinnedSource.runId, pinnedSource.revisionId)}
            >
              重新授權讀取指定 SavedResult Revision
            </button>
          </div>
        )}
        <Label htmlFor="file-import-file">選擇 File</Label>
        <NativeSelect
          id="file-import-file"
          value={fileId}
          disabled={disabled || busy}
          onChange={(event) => void openFile(event.target.value)}
        >
          <NativeSelectOption value="">請選擇已上傳 File</NativeSelectOption>
          {files.map((file) => (
            <NativeSelectOption key={file.fileId} value={file.fileId}>
              {file.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {filesNext && (
          <Button
            variant="outline"
            disabled={busy || disabled}
            onClick={() => void loadFiles(filesNext)}
          >
            載入更多 Files
          </Button>
        )}
        {fileId && (
          <>
            <Label htmlFor="file-import-run">選擇已保存的解析</Label>
            <NativeSelect
              id="file-import-run"
              value={run?.runId ?? ""}
              disabled={disabled || busy}
              onChange={(event) => void openRun(event.target.value)}
            >
              <NativeSelectOption value="">選擇 SavedResult</NativeSelectOption>
              {runs
                .filter((item) => item.state === "SAVED")
                .map((item) => (
                  <NativeSelectOption key={item.runId} value={item.runId}>
                    {item.processorId} · {item.runId.slice(0, 8)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            {runsNext && (
              <Button
                variant="outline"
                disabled={busy || disabled}
                onClick={() => void openFile(fileId, runsNext)}
              >
                載入更多 Runs
              </Button>
            )}
          </>
        )}
        {run?.savedResult && (
          <>
            <Label htmlFor="file-import-observation">選擇原始觀測項次</Label>
            <NativeSelect
              id="file-import-observation"
              value={observationId}
              disabled={disabled || busy}
              onChange={(event) => {
                setObservationId(event.target.value);
                setConfirmedDisclosure(false);
              }}
            >
              <NativeSelectOption value="">請選擇觀測值</NativeSelectOption>
              {run.savedResult.observations
                .filter((o) => o.value !== null)
                .map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.label}: {o.value?.slice(0, 80)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </>
        )}
        {observation && (
          <div className="grid gap-1 rounded-md border p-3 text-sm">
            <p className="font-medium">SavedResult 證據</p>
            <p className="whitespace-pre-wrap break-words">{observation.value}</p>
            {observation.uncertain && (
              <p className="text-destructive">原解析標記為 uncertain，須人工校對。</p>
            )}
            <p className="break-words text-muted-foreground">
              來源定位：
              {observation.source === null ? "未標註" : JSON.stringify(observation.source)}
            </p>
          </div>
        )}
        <Label htmlFor="file-import-kind">Content 節點類別</Label>
        <NativeSelect
          id="file-import-kind"
          value={kind}
          disabled={disabled || busy}
          onChange={(event) => {
            setKind(event.target.value === "TASK" ? "TASK" : "WORK");
            setParentId("");
            setConfirmedDisclosure(false);
          }}
        >
          <NativeSelectOption value="WORK">Work（SubObject 下）</NativeSelectOption>
          <NativeSelectOption value="TASK">Task（Work 下）</NativeSelectOption>
        </NativeSelect>
        <Label htmlFor="file-import-parent">指定既有父節點</Label>
        <NativeSelect
          id="file-import-parent"
          value={parentId}
          disabled={disabled || busy}
          onChange={(event) => {
            setParentId(event.target.value);
            setConfirmedDisclosure(false);
          }}
        >
          <NativeSelectOption value="">請選擇父節點</NativeSelectOption>
          {candidates.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            請先在 Content 建立合法的父層節點；系統不會由解析結果猜測階層。
          </p>
        )}
        <Label htmlFor="file-import-title">由使用者確認的工作名稱</Label>
        <Input
          id="file-import-title"
          value={title}
          disabled={disabled || busy}
          onChange={(event) => {
            setTitle(event.target.value);
            setConfirmedDisclosure(false);
          }}
        />
        <Label htmlFor="file-import-body">工作說明（選填）</Label>
        <Textarea
          id="file-import-body"
          value={body}
          disabled={disabled || busy}
          onChange={(event) => {
            setBody(event.target.value);
            setConfirmedDisclosure(false);
          }}
        />
        <Label htmlFor="file-import-quantity">人工確認的計畫數量</Label>
        <Input
          id="file-import-quantity"
          inputMode="decimal"
          placeholder="例如 26"
          value={quantity}
          disabled={disabled || busy}
          onChange={(event) => {
            setQuantity(event.target.value);
            setConfirmedDisclosure(false);
          }}
        />
        <Label htmlFor="file-import-measure">計量基準</Label>
        <NativeSelect
          id="file-import-measure"
          value={createMeasure ? "new" : measureId}
          disabled={disabled || busy}
          onChange={(event) => {
            setCreateMeasure(event.target.value === "new");
            setMeasureId(event.target.value === "new" ? "" : event.target.value);
            setConfirmedDisclosure(false);
          }}
        >
          <NativeSelectOption value="">請選擇計量基準</NativeSelectOption>
          {measures.map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {m.name} ({m.unit})
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="new">建立新的 Content 計量基準</NativeSelectOption>
        </NativeSelect>
        {createMeasure && (
          <div className="grid gap-2 rounded-md border p-3">
            <Input
              aria-label="新計量名稱"
              placeholder="計量名稱"
              value={measureName}
              disabled={disabled || busy}
              onChange={(event) => {
                setMeasureName(event.target.value);
                setConfirmedDisclosure(false);
              }}
            />
            <Input
              aria-label="新計量主題"
              placeholder="計量主題"
              value={measureSubject}
              disabled={disabled || busy}
              onChange={(event) => {
                setMeasureSubject(event.target.value);
                setConfirmedDisclosure(false);
              }}
            />
            <Input
              aria-label="新計量單位"
              placeholder="例如 SET、組、m²"
              maxLength={32}
              value={measureUnit}
              disabled={disabled || busy}
              onChange={(event) => {
                setMeasureUnit(event.target.value);
                setConfirmedDisclosure(false);
              }}
            />
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmedDisclosure}
            disabled={disabled || busy}
            onChange={(event) => setConfirmedDisclosure(event.target.checked)}
          />
          <span>
            我已核對來源與數量，明確同意將選定的 File 證據整理為正式 Content。 Content
            的讀取範圍可能不同於受保護的原始 File。
          </span>
        </label>
        <Button disabled={!allowed} onClick={() => void confirm()}>
          確認建立 Content Work／Task
        </Button>
      </CardContent>
    </Card>
  );
}
