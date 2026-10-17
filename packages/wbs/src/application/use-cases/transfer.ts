import type {
  CancelWbsScopeTransferCommand,
  ExecuteWbsScopeTransferCommand,
  RequestWbsScopeTransferCommand,
} from "../../contracts/dto/transfer.js";
import type { WbsScopeTransferStore } from "../../contracts/repositories/transfer.js";
import { WbsError } from "../../domain/document.js";
import {
  assertTrustedReleaseContext,
  assertWbsTransferDependenciesEmpty,
  assertWbsTransferRequestFacts,
  assertWbsTransferSnapshot,
  assertWbsTransferSourceOwner,
} from "../../domain/transfer.js";

export function readActiveWbsScopeTransfer(store: WbsScopeTransferStore, transferId: string) {
  return store.readActive(transferId);
}

export async function readWbsScopeTransfer(
  store: WbsScopeTransferStore,
  actorUserId: string,
  repositoryId: string,
) {
  const current = await store.readCurrent(actorUserId, repositoryId);
  assertWbsTransferSourceOwner(actorUserId, current.source);
  return current.transfer;
}

export function requestWbsScopeTransfer(
  store: WbsScopeTransferStore,
  actorUserId: string,
  command: RequestWbsScopeTransferCommand,
  requestedAt: number,
) {
  return store.request(actorUserId, command, requestedAt, async (transaction) => {
    const source = await transaction.source();
    const project = await transaction.project();
    assertWbsTransferRequestFacts(actorUserId, source, project);
    const replay = await transaction.replay();
    if (replay) return replay;
    const snapshot = await transaction.snapshot();
    assertWbsTransferSnapshot(command.sourceVersion, command.sourceHeadRevisionId, snapshot);
    assertWbsTransferDependenciesEmpty(await transaction.dependents());
    if (!(await transaction.destinationEmpty()))
      throw new WbsError(409, "目標 Project 已有 WBS，不能建立移轉請求。");
    return transaction.save(snapshot);
  });
}

export function cancelWbsScopeTransfer(
  store: WbsScopeTransferStore,
  actorUserId: string,
  command: CancelWbsScopeTransferCommand,
  cancelledAt: number,
) {
  return store.cancel(actorUserId, command, cancelledAt, async (transaction) => {
    const transfer = await transaction.load();
    if (transfer.repositoryId !== command.repositoryId)
      throw new WbsError(409, "撤回請求與原移轉範圍不一致。");
    assertWbsTransferSourceOwner(actorUserId, await transaction.source());
    if (transfer.state === "ACTIVE") throw new WbsError(409, "已啟用的 WBS 移轉不能撤回。");
    if (transfer.state === "CANCELLED") {
      if (transfer.cancelRequestId !== command.requestId)
        throw new WbsError(409, "此 WBS 移轉已由不同請求撤回。");
      return transfer;
    }
    return transaction.cancel(transfer);
  });
}

export function executeWbsScopeTransfer(
  store: WbsScopeTransferStore,
  command: ExecuteWbsScopeTransferCommand,
  activatedAt: number,
) {
  return store.execute(command.transferId, async (transaction) => {
    const transfer = await transaction.load();
    if (transfer.state === "ACTIVE") return transfer;
    if (transfer.state === "CANCELLED") throw new WbsError(409, "已撤回的 WBS 移轉不能啟用。");
    const releaseSha = assertTrustedReleaseContext(command);
    const source = await transaction.source(transfer.actorUserId, transfer.repositoryId);
    const project = await transaction.project(transfer.actorUserId, transfer.projectId);
    assertWbsTransferRequestFacts(transfer.actorUserId, source, project);
    const snapshot = await transaction.snapshot(transfer.repositoryId);
    const dependents = await transaction.dependents(
      transfer.actorUserId,
      transfer.repositoryId,
      transfer.projectId,
    );
    const destinationEmpty = await transaction.destinationEmpty(transfer.projectId);
    assertWbsTransferSnapshot(transfer.sourceVersion, transfer.sourceHeadRevisionId, snapshot);
    if (
      snapshot.sourceHash !== transfer.sourceHash ||
      snapshot.revisionCount !== transfer.revisionCount ||
      snapshot.commandCount !== transfer.commandCount
    )
      throw new WbsError(409, "來源 WBS 歷史已變更，不能執行移轉。");
    assertWbsTransferDependenciesEmpty(dependents);
    if (!destinationEmpty) throw new WbsError(409, "目標 Project 已有 WBS，不能執行移轉。");
    return transaction.activate(transfer, releaseSha, activatedAt);
  });
}
