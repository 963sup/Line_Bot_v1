"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { Button } from "../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/card";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import PurchaseOrderReview from "./purchase-order-review";

import {
  type FileInfo,
  type PendingUpload,
  type View,
  type Pending,
  type SignedCommand,
  type FileMutation,
  StaleRequest,
  record,
  stringValue,
  parseFile,
  parseView,
  parsePendingPage,
  parseMutation,
  errorMessage,
} from "./files-projection";
import {
  type DocumentIntakeReceipt,
  type DocumentIntakeRevision,
  type DocumentIntakeCommand,
  diagnosticLabels,
  parseDocumentIntakeReceipt,
  parseDocumentIntakeRevision,
  candidateLines,
  sourceReviewPages,
} from "./purchase-order-intake-view";

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
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [pendingUploadsNext, setPendingUploadsNext] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const mutationLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const review = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (documentIntakeRevision) review.current?.focus();
  }, [documentIntakeRevision]);

  const clear = useCallback(() => {
    epoch.current++;
    mutationLock.current = false;
    setView(null);
    setSelected(null);
    setDocumentIntakeReceipt(null);
    setDocumentIntakeRevision(null);
    setSourceReviewConfirmed(false);
    setAcknowledgementReason("");
    setPendingDocumentConfirmation(null);
    setPendingDocumentIntake(null);
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
    async (query: Record<string, string> = {}, mutation?: FileMutation): Promise<unknown> => {
      const ticket = epoch.current;
      const session = await liffClient.ensureSession(liffId);
      if (ticket !== epoch.current) throw new StaleRequest();
      if (!session) throw new Error("請完成 LINE 登入後重試。");
      const search = new URLSearchParams({ owner: ownerLogin, name: repositoryName, ...query });
      const headers: Record<string, string> = { "X-App-Session-Generation": session };
      let body: BodyInit | undefined;
      if (mutation) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ operation: mutation.operation, command: mutation.command });
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
      const contentType = response.headers.get("content-type") ?? "";
      const value: unknown = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      if (ticket !== epoch.current) throw new StaleRequest();
      if (!response.ok) {
        const message =
          value && typeof value === "object" && "error" in value && typeof value.error === "string"
            ? value.error
            : response.status === 504
              ? "採購單 AI 解析逾時，請稍後重試。"
              : query.operation === "read"
                ? "ContractDocument 讀取失敗。"
                : "採購單操作失敗。";
        if (response.status === 401 || response.status === 403) {
          clear();
          setError(message);
          throw new StaleRequest();
        }
        const code = value && typeof value === "object" && "code" in value ? value.code : null;
        throw Object.assign(
          new Error(
            code === "UNKNOWN_RESULT"
              ? "解析結果尚未確認；原命令重試只會查詢已保存回執，不會重新解析。請保留此頁並聯絡管理員查核。"
              : message,
          ),
          { status: response.status, code },
        );
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
      const page = parseView(await request());
      if (ticket !== epoch.current) return;
      setView(page);
      setPendingUploads(page.uploads);
      setPendingUploadsNext(page.pendingNext);
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
    window.addEventListener("pagehide", clear);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", clear);
    };
  }, [clear]);

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

  async function openFile(file: FileInfo) {
    if (pendingDocumentIntake || pendingDocumentConfirmation || mutationLock.current) return;
    await loadFileDetails(file);
  }

  async function loadFileDetails(file: FileInfo) {
    const ticket = epoch.current;
    setBusy(true);
    setError("");
    try {
      const current = await request({ view: "file", fileId: file.fileId });
      if (ticket !== epoch.current) return;
      setSelected(parseFile(record(current).file));
      setDocumentIntakeReceipt(null);
      setDocumentIntakeRevision(null);
      setSourceReviewConfirmed(false);
      setAcknowledgementReason("");
      setPendingDocumentConfirmation(null);
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
      // Browser computes the descriptor without routing the Binary through Next.js.
      // The server still verifies SHA-256 against trusted Storage bytes before commit.
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", await next.file.arrayBuffer()),
      );
      if (ticket !== epoch.current) throw new StaleRequest();
      const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const command: SignedCommand = { ...next.command, byteLength: next.file.size, sha256 };
      const prepared = record(await request({}, { operation: "prepare-upload", command }));
      let response: { requestId: string; file: FileInfo };
      if ("file" in prepared) {
        response = parseMutation(prepared);
      } else {
        if (stringValue(prepared.requestId) !== command.requestId)
          throw new Error("Upload Intent identity mismatch.");
        const signedUrl = stringValue(prepared.signedUrl);
        // Signed tickets are capabilities: never send original bytes to an arbitrary URL.
        const destination = new URL(signedUrl);
        if (
          destination.protocol !== "https:" ||
          !/^[a-z0-9-]+\.supabase\.co$/.test(destination.hostname) ||
          !destination.pathname.startsWith("/storage/v1/object/upload/sign/repository-files/") ||
          !destination.searchParams.has("token")
        )
          throw new Error("Storage ticket is invalid.");
        const payload = new FormData();
        payload.set("cacheControl", "0");
        payload.append("", next.file);
        // An unknown upload outcome is reconciled by File's exact server-side readback.
        // A duplicate PUT is harmless: upsert is forbidden and Finalize verifies the original.
        try {
          await fetch(signedUrl, {
            method: "PUT",
            headers: { "x-upsert": "false" },
            body: payload,
            cache: "no-store",
          });
        } catch {
          // Retry Finalize even if the provider response was lost.
        }
        if (ticket !== epoch.current) throw new StaleRequest();
        response = parseMutation(await request({}, { operation: "complete-upload", command }));
      }
      if (ticket !== epoch.current) return;
      if (response.requestId !== next.command.requestId)
        throw new Error("File receipt 尚未確認，請使用原命令重試。");
      setPending(null);
      setSourceFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await load();
      if (ticket !== epoch.current) return;
      await loadFileDetails(response.file);
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
    if (
      !view?.canEdit ||
      !sourceFile ||
      pending ||
      busy ||
      pendingDocumentIntake ||
      pendingDocumentConfirmation ||
      mutationLock.current
    )
      return;
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
    if (
      !view?.canEdit ||
      !sourceFile ||
      pending ||
      busy ||
      pendingDocumentIntake ||
      pendingDocumentConfirmation ||
      mutationLock.current
    )
      return;
    if (!sourceFile.size || sourceFile.size > view.uploadMaxBytes) {
      setError("Browser Upload 上限為 3 MB；更大的檔案目前請使用受保護的 File CLI。");
      return;
    }
    const next: Pending = {
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

  async function intakePurchaseOrder(command: DocumentIntakeCommand) {
    if (!view?.canEdit || pending || busy || pendingDocumentConfirmation || mutationLock.current)
      return;
    mutationLock.current = true;
    const ticket = epoch.current;
    const file = view.files.find((item) => item.fileId === command.source.fileId);
    if (file) setSelected(file);
    setPendingDocumentIntake(command);
    setBusy(true);
    setError("");
    let saved = false;
    try {
      const receipt = parseDocumentIntakeReceipt(
        await requestDocumentIntake({ operation: "intake" }, command),
      );
      if (ticket !== epoch.current) return;
      if (receipt.requestId !== command.requestId || receipt.documentId !== command.documentId)
        throw new Error("Contract 草稿回執不符，請使用原命令重試。");
      saved = true;
      setDocumentIntakeReceipt(receipt);
      const revision = parseDocumentIntakeRevision(
        record(
          await requestDocumentIntake({
            operation: "read",
            documentId: receipt.documentId,
            revisionId: receipt.revisionId,
          }),
        ).revision,
      );
      if (ticket !== epoch.current) return;
      if (
        revision.documentId !== receipt.documentId ||
        revision.revisionId !== receipt.revisionId ||
        revision.source.fileId !== command.source.fileId ||
        revision.source.fileRevisionId !== command.source.fileRevisionId ||
        revision.source.fileSha256 !== command.source.fileSha256
      )
        throw new Error("Contract 草稿來源不符，請使用原命令重新查核。");
      setDocumentIntakeRevision(revision);
      setSourceReviewConfirmed(false);
      setAcknowledgementReason("");
      setPendingDocumentConfirmation(null);
      setPendingDocumentIntake(null);
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 503;
      if (!saved && status >= 400 && status < 500 && status !== 409 && status !== 429)
        setPendingDocumentIntake(null);
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) {
        setBusy(false);
        mutationLock.current = false;
      }
    }
  }

  async function confirmPurchaseOrder() {
    if (
      !view?.canEdit ||
      !documentIntakeReceipt ||
      !documentIntakeRevision ||
      busy ||
      pending ||
      mutationLock.current
    )
      return;
    if (documentIntakeRevision.state !== "DRAFT") return;
    if (!sourceReviewConfirmed) {
      setError("請先逐行核對原始檔，再確認採購單。");
      return;
    }
    const lines = candidateLines(documentIntakeRevision.candidate);
    const reviewedSourcePages = sourceReviewPages(documentIntakeRevision.candidate);
    if (reviewedSourcePages.length === 0) {
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
    mutationLock.current = true;
    const ticket = epoch.current;
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
      if (ticket !== epoch.current) return;
      if (
        receipt.requestId !== command.requestId ||
        receipt.documentId !== command.documentId ||
        revision.documentId !== receipt.documentId ||
        revision.revisionId !== receipt.revisionId
      )
        throw new Error("Contract 確認回執不符，請使用原命令重試。");
      setDocumentIntakeReceipt(receipt);
      setDocumentIntakeRevision(revision);
      setSourceReviewConfirmed(false);
      setPendingDocumentConfirmation(null);
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 503;
      if (status >= 400 && status < 500 && status !== 409 && status !== 429)
        setPendingDocumentConfirmation(null);
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) {
        setBusy(false);
        mutationLock.current = false;
      }
    }
  }

  function startPurchaseOrderIntake(file = selected) {
    if (
      !view?.canEdit ||
      !file ||
      pending ||
      busy ||
      pendingDocumentIntake ||
      pendingDocumentConfirmation ||
      mutationLock.current
    )
      return;
    setDocumentIntakeReceipt(null);
    setDocumentIntakeRevision(null);
    setPendingDocumentConfirmation(null);
    setSourceReviewConfirmed(false);
    setAcknowledgementReason("");
    void intakePurchaseOrder({
      action: "save",
      repositoryId: view.repository.id,
      documentId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      expectedVersion: 0,
      source: {
        fileId: file.fileId,
        fileRevisionId: file.revisionId,
        fileSha256: file.sha256,
      },
    });
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

  const blocked = busy || !!pending || !!pendingDocumentIntake || !!pendingDocumentConfirmation;

  return (
    <div className="grid min-w-0 gap-4 p-4 md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <Card>
        <CardHeader>
          <CardTitle>原始檔案</CardTitle>
          <CardDescription>只列出目前 Repository 中已提交的原始檔案。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label htmlFor="repository-file">上傳原始檔案</Label>
          <Input
            ref={fileInput}
            id="repository-file"
            type="file"
            disabled={!view?.canEdit || blocked}
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Web 單檔上限 {view ? (view.uploadMaxBytes / 1_000_000).toFixed(0) : "3"} MB。
            上傳後請選擇「建立採購單草稿」，才會開始解析。
          </p>
          <Button disabled={!view?.canEdit || !sourceFile || blocked} onClick={upload}>
            上傳檔案
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
                    disabled={!view?.canEdit || !sourceFile || blocked}
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
                <div
                  key={file.fileId}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                >
                  <Button
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 justify-start whitespace-normal break-all text-left"
                    disabled={blocked}
                    aria-pressed={selected?.fileId === file.fileId}
                    onClick={() => void openFile(file)}
                  >
                    {file.name} · v{file.version} · {Math.ceil(file.byteLength / 1024)} KB
                  </Button>
                  {["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
                    file.mediaType,
                  ) && (
                    <Button
                      size="sm"
                      disabled={!view.canEdit || blocked}
                      onClick={() => startPurchaseOrderIntake(file)}
                    >
                      {busy && pendingDocumentIntake?.source.fileId === file.fileId
                        ? "解析並保存中…"
                        : "建立採購單草稿"}
                    </Button>
                  )}
                </div>
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
          {selected && <CardTitle className="break-all">{selected.name}</CardTitle>}
          <CardDescription>
            原始檔保存；由「建立採購單草稿」解析並保存至 Contract，核對原始檔後再確認。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!selected && !busy && (
            <p className="text-sm text-muted-foreground">
              請選擇原始檔案查看內容，或使用「建立採購單草稿」開始解析。支援 PDF、JPEG、PNG 與
              WebP。
            </p>
          )}
          {busy && (
            <p role="status">
              {pendingDocumentIntake
                ? "正在解析並保存採購單，請稍候…"
                : pendingDocumentConfirmation
                  ? "正在確認採購單…"
                  : "正在處理檔案…"}
            </p>
          )}
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
                下載原始檔
              </Button>
              {selected.byteLength > (view?.uploadMaxBytes ?? 0) && (
                <p className="text-xs text-muted-foreground">
                  大型原始檔案須經受保護的 File CLI 下載；Web 傳輸上限 3 MB。
                </p>
              )}
              {!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
                selected.mediaType,
              ) && (
                <p className="text-sm text-muted-foreground">
                  此格式可保存與下載；採購單解析目前支援 PDF、JPEG、PNG 與 WebP。
                </p>
              )}
              {view?.canEdit && (
                <>
                  {pendingDocumentIntake && (
                    <Button
                      variant="outline"
                      disabled={busy || !!pending}
                      onClick={() => void intakePurchaseOrder(pendingDocumentIntake)}
                    >
                      以原請求重試／查詢結果
                    </Button>
                  )}
                  {documentIntakeReceipt && (
                    <p role="status" className="break-all text-xs text-muted-foreground">
                      採購單已保存：{documentIntakeReceipt.documentId} · Revision v
                      {documentIntakeReceipt.version}。
                    </p>
                  )}
                  {documentIntakeRevision && (
                    <div
                      ref={review}
                      tabIndex={-1}
                      role="region"
                      aria-label="採購單審核"
                      className="grid min-w-0 gap-3 rounded-md border p-3"
                    >
                      <div>
                        <p className="font-medium">採購單審核</p>
                        <p className="text-xs text-muted-foreground">
                          {documentIntakeRevision.state === "CONFIRMED"
                            ? "採購單已確認並保存。"
                            : `候選 v${documentIntakeRevision.version} · 系統辨識 ${candidateLines(documentIntakeRevision.candidate).length} 筆明細`}
                        </p>
                      </div>
                      {documentIntakeRevision.diagnostics.length > 0 && (
                        <p className="text-sm text-destructive">
                          {documentIntakeRevision.diagnostics
                            .map((code) => diagnosticLabels[code] ?? `需核對：${code}`)
                            .join("；")}
                        </p>
                      )}
                      <PurchaseOrderReview candidate={documentIntakeRevision.candidate} />
                      {documentIntakeRevision.state === "DRAFT" && (
                        <>
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={sourceReviewConfirmed}
                              disabled={busy || !!pending || !!pendingDocumentConfirmation}
                              onChange={(event) => setSourceReviewConfirmed(event.target.checked)}
                            />
                            <span>
                              我已核對原始檔、全部明細、來源頁與金額，確認以上採購單資料正確。
                            </span>
                          </label>
                          {documentIntakeRevision.diagnostics.some((item) =>
                            item.includes("MISMATCH"),
                          ) && (
                            <div className="grid gap-2">
                              <Label htmlFor="purchase-order-acknowledgement">
                                金額差異確認理由
                              </Label>
                              <Input
                                id="purchase-order-acknowledgement"
                                placeholder="請說明接受此金額差異的原因"
                                value={acknowledgementReason}
                                disabled={busy || !!pending || !!pendingDocumentConfirmation}
                                onChange={(event) => setAcknowledgementReason(event.target.value)}
                              />
                            </div>
                          )}
                          <Button
                            disabled={
                              busy ||
                              !!pending ||
                              (!pendingDocumentConfirmation && !sourceReviewConfirmed)
                            }
                            onClick={() => void confirmPurchaseOrder()}
                          >
                            {pendingDocumentConfirmation ? "以原請求重試確認" : "確認採購單"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
