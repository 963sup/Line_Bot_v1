"use client";

import { isRecord } from "@line_bot_v1/platform/validation";
import { parseProjectManagementReceipt } from "@line_bot_v1/project/application/management";
import type {
  CancelWbsScopeTransferCommand,
  WbsScopeTransfer,
} from "@line_bot_v1/wbs/contracts/dto/transfer";
import { parseWbsScopeTransfer } from "@line_bot_v1/wbs/contracts/parse-transfer-response";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import type {
  CreateTransferProjectCommand,
  WbsTransferCancellation,
  WbsTransferOperation,
} from "./wbs-transfer-state";
import {
  parseWbsTransferCancellation,
  parseWbsTransferOperation,
  reconcileWbsTransferCancellation,
} from "./wbs-transfer-state";

class TransferRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const storageKey = (repositoryId: string, actorUserId: string) =>
  `wbs-transfer:${repositoryId}:${actorUserId}`;
const cancellationStorageKey = (repositoryId: string, actorUserId: string) =>
  `wbs-transfer-cancel:${repositoryId}:${actorUserId}`;

async function responseBody(response: Response) {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    if (!response.ok) throw new TransferRequestError(text, response.status || 503);
  }
  if (!response.ok)
    throw new TransferRequestError(
      isRecord(body) && typeof body.error === "string" ? body.error : text,
      response.status,
    );
  return body;
}

async function currentActor(token: string) {
  const response = await fetch("/api/membership?view=account", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-App-Session-Generation": token },
  });
  const body = await responseBody(response);
  if (
    !isRecord(body) ||
    !isRecord(body.member) ||
    body.member.status !== "active" ||
    typeof body.member.id !== "string"
  )
    throw new TransferRequestError("請先完成有效會員登入。", 403);
  return body.member.id;
}

async function createProject(token: string, command: CreateTransferProjectCommand) {
  const response = await fetch("/api/project-management", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "X-App-Session-Generation": token },
    body: JSON.stringify(command),
  });
  const body = await responseBody(response);
  try {
    return parseProjectManagementReceipt(body);
  } catch {
    throw new TransferRequestError("目標 Project 建立回執不完整，請重試原操作。", 503);
  }
}

async function requestTransfer(
  token: string,
  command: NonNullable<WbsTransferOperation["transferCommand"]>,
) {
  const response = await fetch("/api/repository-wbs/transfer", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "X-App-Session-Generation": token },
    body: JSON.stringify(command),
  });
  return parseWbsScopeTransfer(await responseBody(response));
}

async function readTransfer(token: string, repositoryId: string) {
  const response = await fetch(
    `/api/repository-wbs/transfer?${new URLSearchParams({ repositoryId })}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "X-App-Session-Generation": token },
    },
  );
  const body = await responseBody(response);
  return body === null ? null : parseWbsScopeTransfer(body);
}

async function cancelTransfer(token: string, command: CancelWbsScopeTransferCommand) {
  const response = await fetch("/api/repository-wbs/transfer/cancel", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "X-App-Session-Generation": token },
    body: JSON.stringify(command),
  });
  return parseWbsScopeTransfer(await responseBody(response));
}

export default function WbsTransferPanel({
  liffId,
  actorUserId,
  repositoryId,
  repositoryName,
  sourceVersion,
  sourceHeadRevisionId,
  canManageRepository,
  disabled,
}: {
  liffId: string;
  actorUserId: string;
  repositoryId: string;
  repositoryName: string;
  sourceVersion: number;
  sourceHeadRevisionId: string;
  canManageRepository: boolean;
  disabled: boolean;
}) {
  const [operation, setOperation] = useState<WbsTransferOperation | null>(null);
  const [liveTransfer, setLiveTransfer] = useState<WbsScopeTransfer | null>(null);
  const [cancelledTransfer, setCancelledTransfer] = useState<WbsScopeTransfer | null>(null);
  const [cancellation, setCancellation] = useState<WbsTransferCancellation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const key = storageKey(repositoryId, actorUserId);
  const cancelKey = cancellationStorageKey(repositoryId, actorUserId);

  function remember(value: WbsTransferOperation | null) {
    setOperation(value);
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      if (value) throw new TransferRequestError("無法保存安全重試資訊；操作尚未送出。", 503);
    }
  }

  function rememberCancellation(value: WbsTransferCancellation | null) {
    setCancellation(value);
    try {
      if (value) sessionStorage.setItem(cancelKey, JSON.stringify(value));
      else sessionStorage.removeItem(cancelKey);
    } catch {
      if (value) throw new TransferRequestError("無法保存撤回重試資訊；操作尚未送出。", 503);
    }
  }

  const clearPrivateState = useCallback(() => {
    generation.current++;
    setOperation(null);
    setLiveTransfer(null);
    setCancelledTransfer(null);
    setCancellation(null);
    setLoading(false);
    setBusy(false);
    setError("");
  }, []);

  useEffect(() => {
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    setOperation(null);
    setLiveTransfer(null);
    setCancellation(null);
    const actorKey = `wbs-transfer-actor:${repositoryId}`;
    let recoveredOperation: WbsTransferOperation | null = null;
    let recoveredCancellation: WbsTransferCancellation | null = null;
    try {
      const previousActor = sessionStorage.getItem(actorKey);
      if (previousActor && previousActor !== actorUserId) {
        sessionStorage.removeItem(storageKey(repositoryId, previousActor));
        sessionStorage.removeItem(cancellationStorageKey(repositoryId, previousActor));
      }
      sessionStorage.setItem(actorKey, actorUserId);
      const raw = sessionStorage.getItem(key);
      recoveredOperation = raw
        ? parseWbsTransferOperation(JSON.parse(raw), {
            actorUserId,
            repositoryId,
            sourceVersion,
            sourceHeadRevisionId,
          })
        : null;
      const cancelRaw = sessionStorage.getItem(cancelKey);
      recoveredCancellation = cancelRaw
        ? parseWbsTransferCancellation(JSON.parse(cancelRaw), { actorUserId, repositoryId })
        : null;
    } catch {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(cancelKey);
    }
    setCancelledTransfer(null);
    void (async () => {
      try {
        const token = await liffClient.ensureSession(liffId);
        if (!token) throw new TransferRequestError("請完成 LINE 登入。", 401);
        const durable = await readTransfer(token, repositoryId);
        if (ticket !== generation.current) return;
        if (
          durable &&
          (durable.actorUserId !== actorUserId || durable.repositoryId !== repositoryId)
        )
          throw new TransferRequestError("WBS 移轉狀態與目前登入範圍不一致。", 403);
        const reconciledCancellation = reconcileWbsTransferCancellation(
          recoveredCancellation,
          durable,
        );
        setLiveTransfer(durable);
        setCancellation(reconciledCancellation);
        if (recoveredCancellation && !reconciledCancellation) sessionStorage.removeItem(cancelKey);
        if (!durable && !reconciledCancellation && recoveredOperation?.accepted) {
          setOperation(null);
          sessionStorage.removeItem(key);
        } else if (
          durable &&
          (!recoveredOperation?.accepted || recoveredOperation.accepted.id !== durable.id)
        ) {
          setOperation(null);
          sessionStorage.removeItem(key);
        } else {
          setOperation(recoveredOperation);
        }
      } catch (cause) {
        if (ticket !== generation.current) return;
        const status = cause instanceof TransferRequestError ? cause.status : 503;
        if ([401, 403, 404].includes(status)) clearPrivateState();
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (ticket === generation.current) setLoading(false);
      }
    })();
    return () => {
      generation.current++;
    };
  }, [
    actorUserId,
    cancelKey,
    clearPrivateState,
    key,
    liffId,
    repositoryId,
    sourceHeadRevisionId,
    sourceVersion,
  ]);

  useEffect(() => {
    const clear = () => clearPrivateState();
    const unsubscribe = liffClient.onSessionBlocked(clear);
    window.addEventListener("pagehide", clear);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", clear);
    };
  }, [clearPrivateState]);

  async function execute(value: WbsTransferOperation) {
    if (locked.current || value.accepted || liveTransfer || cancellation) return;
    locked.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new TransferRequestError("請完成 LINE 登入。", 401);
      if ((await currentActor(token)) !== value.actorUserId)
        throw new TransferRequestError("LINE 使用者已切換，請重新載入 WBS。", 403);
      const receipt = await createProject(token, value.createCommand);
      if (ticket !== generation.current) return;
      if (
        receipt.requestId !== value.createCommand.requestId ||
        receipt.action !== "create-project" ||
        !receipt.projectId ||
        receipt.resourceId !== receipt.projectId ||
        (value.transferCommand !== null && value.transferCommand.projectId !== receipt.projectId)
      )
        throw new TransferRequestError("目標 Project 建立回執不完整，請重試原操作。", 503);
      const pending: WbsTransferOperation = value.transferCommand
        ? value
        : {
            ...value,
            transferCommand: {
              transferId: crypto.randomUUID(),
              requestId: crypto.randomUUID(),
              repositoryId: value.repositoryId,
              projectId: receipt.projectId,
              sourceVersion: value.sourceVersion,
              sourceHeadRevisionId: value.sourceHeadRevisionId,
            },
          };
      if (!pending.transferCommand) throw new Error("WBS 移轉請求未建立。");
      remember(pending);
      const accepted = await requestTransfer(token, pending.transferCommand);
      if (ticket !== generation.current) return;
      if (
        accepted.id !== pending.transferCommand.transferId ||
        accepted.requestId !== pending.transferCommand.requestId ||
        accepted.repositoryId !== pending.repositoryId ||
        accepted.projectId !== pending.transferCommand.projectId
      )
        throw new TransferRequestError("WBS 移轉回執不一致，請重試原操作。", 503);
      if (accepted.state === "CANCELLED") {
        setCancelledTransfer(accepted);
        setLiveTransfer(null);
        remember(null);
        rememberCancellation(null);
        return;
      }
      setLiveTransfer(accepted);
      remember({ ...pending, accepted });
    } catch (cause) {
      if (ticket !== generation.current) return;
      const status = cause instanceof TransferRequestError ? cause.status : 503;
      if ([401, 403, 404].includes(status)) clearPrivateState();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function withdraw(
    command: CancelWbsScopeTransferCommand,
    expectedLiveTransferId: string | null,
  ) {
    if (locked.current) return;
    locked.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new TransferRequestError("請完成 LINE 登入。", 401);
      if ((await currentActor(token)) !== actorUserId)
        throw new TransferRequestError("LINE 使用者已切換，請重新載入 WBS。", 403);
      const receipt = await cancelTransfer(token, command);
      if (ticket !== generation.current) return;
      if (
        (expectedLiveTransferId !== null && expectedLiveTransferId !== command.transferId) ||
        receipt.id !== command.transferId ||
        receipt.repositoryId !== command.repositoryId ||
        receipt.state !== "CANCELLED" ||
        receipt.cancelRequestId !== command.requestId
      )
        throw new TransferRequestError("WBS 移轉撤回回執不一致，請重試原操作。", 503);
      setCancelledTransfer(receipt);
      setLiveTransfer(null);
      remember(null);
      rememberCancellation(null);
    } catch (cause) {
      if (ticket !== generation.current) return;
      const status = cause instanceof TransferRequestError ? cause.status : 503;
      if ([401, 403, 404].includes(status)) clearPrivateState();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }

  function startWithdrawal(transfer: WbsScopeTransfer) {
    if (busy || transfer.state !== "REQUESTED") return;
    const reusable = reconcileWbsTransferCancellation(cancellation, transfer);
    const value: WbsTransferCancellation = reusable ?? {
      actorUserId,
      repositoryId,
      command: { transferId: transfer.id, repositoryId, requestId: crypto.randomUUID() },
    };
    try {
      if (cancellation && !reusable) rememberCancellation(null);
      rememberCancellation(value);
      void withdraw(value.command, transfer.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function start() {
    if (
      operation ||
      liveTransfer ||
      cancellation ||
      busy ||
      loading ||
      disabled ||
      !canManageRepository
    )
      return;
    const value: WbsTransferOperation = {
      actorUserId,
      repositoryId,
      sourceVersion,
      sourceHeadRevisionId,
      createCommand: {
        action: "create-project",
        requestId: crypto.randomUUID(),
        ownerAccountId: actorUserId,
        ownerKind: "USER",
        expectedVersion: 0,
        title: `${repositoryName} WBS`,
        public: false,
        repositoryId,
        teamId: null,
      },
      transferCommand: null,
      accepted: null,
    };
    try {
      remember(value);
      void execute(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const accepted = liveTransfer ?? operation?.accepted ?? null;
  if (!canManageRepository && !operation && !accepted && !cancellation) return null;
  return (
    <section className="crud-guidance" aria-label="Project WBS 移轉">
      <h2>移轉至 Project WBS</h2>
      <p>
        這會為你建立私人 Project，並提出舊 WBS
        的移轉請求。提出請求不代表已完成移轉，請以目前狀態為準。
      </p>
      {loading && <p role="status">正在讀取移轉狀態…</p>}
      {error && <p role="alert">{error}</p>}
      {accepted && accepted.state !== "CANCELLED" ? (
        <>
          <p role="status">
            {accepted.state === "ACTIVE"
              ? "移轉已完成，請改用 Project WBS。"
              : "移轉請求已建立，等待完成；目前仍使用舊 WBS。"}
          </p>
          <Link
            href={`/projects/${encodeURIComponent(accepted.projectId)}${accepted.state === "ACTIVE" ? "/wbs" : ""}`}
          >
            {accepted.state === "ACTIVE" ? "開啟 Project WBS" : "查看目標 Project"}
          </Link>
          <details>
            <summary>移轉紀錄</summary>
            <p>
              Transfer ID：{accepted.id}；目標 Project ID：{accepted.projectId}；狀態：
              {accepted.state}。
            </p>
            <p>
              固定來源版本：{accepted.sourceVersion}；來源 Revision：{accepted.sourceHeadRevisionId}
              。
            </p>
          </details>
          {accepted.state === "REQUESTED" && (
            <button type="button" disabled={busy} onClick={() => startWithdrawal(accepted)}>
              {busy ? "處理中…" : cancellation ? "重試撤回移轉請求" : "撤回移轉請求"}
            </button>
          )}
        </>
      ) : cancellation ? (
        <>
          <p role="status">撤回結果尚待確認；重試會沿用原 cancel requestId。</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void withdraw(cancellation.command, null)}
          >
            {busy ? "處理中…" : "重試撤回移轉請求"}
          </button>
        </>
      ) : operation ? (
        <>
          <p role="status">操作結果尚待確認；重試會沿用原 Project 與移轉 requestId。</p>
          <button type="button" disabled={busy || disabled} onClick={() => void execute(operation)}>
            {busy ? "處理中…" : "重試原操作"}
          </button>
        </>
      ) : (
        <>
          {cancelledTransfer && (
            <p role="status">移轉請求已撤回；Transfer ID：{cancelledTransfer.id}。</p>
          )}
          <button type="button" disabled={busy || loading || disabled} onClick={start}>
            建立 Project 與移轉請求
          </button>
        </>
      )}
    </section>
  );
}
