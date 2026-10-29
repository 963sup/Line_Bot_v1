"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui/button";
import CommercialDraftReview, { CommercialIntakeSource } from "./commercial-draft-review";
import {
  commercialDocumentId,
  commercialRecoveryActions,
  commercialStatus,
  isMissingCommercialIntake,
  newCommercialIntake,
  observeCommercialDraft,
  type PendingCommercialIntake,
  restoreCommercialIntake,
} from "./commercial-intake-state";
import { errorMessage, type FileInfo, record, StaleRequest } from "./files-projection";

type Props = {
  actorUserId: string;
  repositoryId: string;
  selected: FileInfo | null;
  canEdit: boolean;
  blocked: boolean;
  request(query: Record<string, string>, command?: object): Promise<unknown>;
  legacyRequest(query: Record<string, string>, command?: object): Promise<unknown>;
  read(query: Record<string, string>): Promise<unknown>;
};
export default function CommercialIntakePanel(props: Props) {
  const [pending, setPending] = useState<PendingCommercialIntake | null>(null),
    [state, setState] = useState(""),
    [revision, setRevision] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [missingIntake, setMissingIntake] = useState(false),
    [confirmAbandon, setConfirmAbandon] = useState(false),
    [restored, setRestored] = useState(false),
    [sourceLoading, setSourceLoading] = useState(false),
    [savedDraft, setSavedDraft] = useState<{ file: FileInfo; revision: unknown } | null>(null);
  const current = useRef(0),
    lock = useRef(false);
  const storageKey = `commercial-intake:${props.actorUserId}:${props.repositoryId}`;
  const execute = useCallback(
    async function execute(
      operation: "start" | "status" | "resume",
      command: PendingCommercialIntake,
      ticket = current.current,
    ) {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError("");
      setConfirmAbandon(false);
      if (operation === "start") {
        setMissingIntake(false);
        setState("OUTCOME_UNKNOWN");
      }
      try {
        const response = "taskId" in command
          ? await props.request(
              operation === "status" ? { taskId: command.taskId } : {},
              operation === "status"
                ? undefined
                : operation === "start"
                  ? { operation, taskId: command.taskId, repositoryId: command.repositoryId, source: command.source }
                  : { operation, taskId: command.taskId, repositoryId: command.repositoryId },
            )
          : await props.legacyRequest(
              operation === "status" ? { commandId: command.commandId } : {},
              operation === "status"
                ? undefined
                : operation === "start"
                  ? { operation, ...command }
                  : { operation, repositoryId: command.repositoryId, commandId: command.commandId },
            );
        if (ticket !== current.current) return;
        const observed = commercialStatus(response, command);
        setState(observed);
        setMissingIntake(false);
        if (observed === "DRAFT_SAVED") {
          const documentId = commercialDocumentId(response, command);
          const draftResponse = record(await props.read({ documentId }));
          if (ticket !== current.current) return;
          if (!draftResponse.revision) throw new Error("草稿讀取尚未完成，請以原命令查詢狀態。");
          const draft = record(draftResponse.revision);
          const source = record(draft.source);
          if (draft.documentId !== documentId ||
              source.fileId !== command.source.fileId ||
              source.fileRevisionId !== command.source.fileRevisionId ||
              source.sha256 !== command.source.sha256)
            throw new Error("已保存商務草稿與原始來源不符。");
          setRevision(draftResponse.revision);
        }
      } catch (cause) {
        if (ticket !== current.current || cause instanceof StaleRequest) return;
        if (operation !== "start" && isMissingCommercialIntake(cause)) setMissingIntake(true);
        setError(errorMessage(cause));
      } finally {
        if (ticket === current.current) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
    [props.request, props.legacyRequest, props.read],
  );
  useEffect(() => {
    const ticket = ++current.current;
    let saved: PendingCommercialIntake | null = null;
    try {
      saved = restoreCommercialIntake(localStorage.getItem(storageKey), props.repositoryId);
    } catch {
      /* Storage unavailable: commands still remain in memory. */
    }
    setPending(saved);
    setRestored(true);
    setState(saved ? "OUTCOME_UNKNOWN" : "");
    setRevision(null);
    setError("");
    setMissingIntake(false);
    setConfirmAbandon(false);
    if (saved) void execute("status", saved, ticket);
    return () => {
      current.current++;
      lock.current = false;
    };
    // Restoring a pending identity performs status readback only, never extraction.
  }, [storageKey, props.repositoryId, execute]);

  useEffect(() => {
    if (!restored) return;
    setSavedDraft(null);
    if (pending || !props.selected) {
      setSourceLoading(false);
      return;
    }
    const source = props.selected;
    setSourceLoading(true);
    setError("");
    return observeCommercialDraft({
      selected: source,
      pending: false,
      read: props.read,
      onResult: (revision) => {
        setSavedDraft(revision === null ? null : { file: source, revision });
        setSourceLoading(false);
      },
      onError: (cause) => {
        setSourceLoading(false);
        if (!(cause instanceof StaleRequest)) setError(errorMessage(cause));
      },
    });
  }, [restored, pending, props.selected, props.read]);

  function start() {
    if (!props.selected || !restored || sourceLoading || pending || lock.current || !props.canEdit)
      return;
    const command = newCommercialIntake(props.selected);
    setPending(command);
    setState("OUTCOME_UNKNOWN");
    try {
      localStorage.setItem(storageKey, JSON.stringify(command));
    } catch {
      setPending(null);
      setError("無法保存命令識別碼；請啟用瀏覽器儲存空間後重試。");
      return;
    }
    void execute("start", command);
  }
  function clearPending() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      setError("無法清除命令記錄；已保留原命令，請稍後重試。");
      return;
    }
    setPending(null);
    setState("");
    setRevision(null);
    setError("");
    setMissingIntake(false);
    setConfirmAbandon(false);
  }
  const recovery = commercialRecoveryActions(state, missingIntake);
  const labels: Record<string, string> = {
    WAITING: "等待處理",
    ANALYZING: "正在解析",
    RESULT_READY: "解析結果已保存，可繼續建立草稿",
    DRAFT_SAVED: "草稿已保存",
    FAILED: "處理失敗，請保留原命令供查核",
    OUTCOME_UNKNOWN: "結果待確認，請查詢原命令",
  };
  return (
    <section className="space-y-3 rounded-md border p-3" aria-label="商務文件解析">
      <h3 className="font-medium">商務文件解析</h3>
      <p className="text-sm text-muted-foreground">
        解析報價、估價、採購或合約原始檔，保存為待人工審閱的 DRAFT。
      </p>
      {!pending && (
        <Button
          disabled={
            !props.canEdit ||
            !restored ||
            sourceLoading ||
            props.blocked ||
            busy ||
            !props.selected ||
            !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
              props.selected.mediaType,
            )
          }
          onClick={start}
        >
          {savedDraft ? "另建一份商務文件草稿" : "解析商務文件"}
        </Button>
      )}
      {pending && (
        <>
          <CommercialIntakeSource
            source={pending.source}
            repositoryId={pending.repositoryId}
            selected={props.selected}
          />
          <p role="status">{labels[state] ?? state}</p>
          <p className="break-all text-xs">任務：{"taskId" in pending ? pending.taskId : pending.commandId}</p>
          <Button
            variant="outline"
            disabled={busy || props.blocked}
            onClick={() => void execute("status", pending)}
          >
            查詢原命令狀態
          </Button>
          {missingIntake && (
            <>
              <p className="text-sm">
                原命令尚未建立處理記錄；可明確重送同一命令，沿用原來源與保存操作，不會另外建立一份文件。
              </p>
              <Button
                disabled={!props.canEdit || busy || props.blocked}
                onClick={() => void execute("start", pending)}
              >
                以原命令重新送出
              </Button>
            </>
          )}
          {recovery.resumeLabel && (
            <Button
              disabled={!props.canEdit || busy || props.blocked}
              onClick={() => void execute("resume", pending)}
            >
              {recovery.resumeLabel}
            </Button>
          )}
          {recovery.canAbandon && (
            <div className="space-y-2">
              <p className="text-sm">
                預設保留原命令。放棄瀏覽器記錄不會取消伺服器工作；原解析可能已扣費或稍後保存結果。之後另建解析可能再次扣費。
              </p>
              {!confirmAbandon ? (
                <Button
                  variant="outline"
                  disabled={busy || props.blocked}
                  onClick={() => setConfirmAbandon(true)}
                >
                  放棄此命令記錄…
                </Button>
              ) : (
                <>
                  <p>確認放棄後，可另行選擇「解析商務文件」；此動作不會自動開始解析。</p>
                  <Button variant="outline" disabled={busy || props.blocked} onClick={clearPending}>
                    確認放棄記錄
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmAbandon(false)}>
                    繼續保留原命令
                  </Button>
                </>
              )}
            </div>
          )}
          {state === "DRAFT_SAVED" && (
            <Button variant="outline" disabled={busy} onClick={clearPending}>
              結束草稿檢視
            </Button>
          )}
        </>
      )}
      {!pending && savedDraft && (
        <section className="space-y-2" aria-label="已保存商務文件">
          <p>已保存草稿 · 唯讀檢視</p>
          <CommercialIntakeSource
            source={{
              fileId: savedDraft.file.fileId,
              fileRevisionId: savedDraft.file.revisionId,
              sha256: savedDraft.file.sha256,
            }}
            repositoryId={savedDraft.file.repositoryId}
            selected={props.selected}
          />
          <CommercialDraftReview revision={savedDraft.revision} />
        </section>
      )}
      {sourceLoading && <p role="status">正在讀取此來源已保存的草稿…</p>}
      {busy && <p role="status">處理中…</p>}
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-destructive">
          {error}
        </p>
      )}
      {revision !== null && <CommercialDraftReview revision={revision} />}
    </section>
  );
}
