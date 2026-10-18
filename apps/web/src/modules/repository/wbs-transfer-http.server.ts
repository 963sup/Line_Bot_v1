import {
  parseCancelWbsScopeTransferCommand,
  parseRequestWbsScopeTransferCommand,
} from "@line_bot_v1/wbs/application/commands/transfer";
import {
  cancelWbsScopeTransfer,
  readWbsScopeTransfer,
  requestWbsScopeTransfer,
} from "@line_bot_v1/wbs/application/use-cases/transfer";
import type { WbsScopeTransferStore } from "@line_bot_v1/wbs/contracts/repositories/transfer";
import { WbsError } from "@line_bot_v1/wbs/domain/document";
import { jsonResponse } from "../../shared/server/http";
import { repositoryBody, repositoryFailure, repositoryPathSelector } from "./http.server";

export async function wbsTransferRequest(
  request: Request,
  store: () => WbsScopeTransferStore,
  identity: (request: Request) => Promise<string>,
  activeUser: (subject: string) => Promise<{ id: string }>,
  now: () => number,
) {
  try {
    const subject = await identity(request);
    const actor = await activeUser(subject);
    const command = parseRequestWbsScopeTransferCommand(await repositoryBody(request, 16_384));
    return jsonResponse(await requestWbsScopeTransfer(store(), actor.id, command, now()));
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return repositoryFailure(error);
  }
}

export async function wbsTransferRead(
  request: Request,
  store: () => WbsScopeTransferStore,
  identity: (request: Request) => Promise<string>,
  activeUser: (subject: string) => Promise<{ id: string }>,
  resolveRepository?: (
    actorUserId: string,
    selector: { ownerLogin: string; repositoryName: string },
  ) => Promise<string>,
) {
  try {
    const subject = await identity(request);
    const actor = await activeUser(subject);
    const query = new URL(request.url).searchParams;
    let repositoryId: string;
    if (query.has("repositoryId")) {
      if (
        [...query.keys()].some((key) => key !== "repositoryId") ||
        query.getAll("repositoryId").length !== 1 ||
        !query.get("repositoryId")
      )
        throw new WbsError(400, "WBS 移轉查詢參數不正確。");
      repositoryId = query.get("repositoryId") ?? "";
    } else {
      if (
        [...query.keys()].some((key) => key !== "owner" && key !== "name") ||
        query.getAll("owner").length !== 1 ||
        query.getAll("name").length !== 1
      )
        throw new WbsError(400, "WBS 移轉查詢需要 Repository 路徑。");
      const selector = repositoryPathSelector(query.get("owner") ?? "", query.get("name") ?? "");
      if (!resolveRepository) throw new WbsError(503, "WBS 移轉來源查詢暫時不可用。");
      repositoryId = await resolveRepository(actor.id, selector);
    }
    return jsonResponse(await readWbsScopeTransfer(store(), actor.id, repositoryId));
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return repositoryFailure(error);
  }
}

export async function wbsTransferCancel(
  request: Request,
  store: () => WbsScopeTransferStore,
  identity: (request: Request) => Promise<string>,
  activeUser: (subject: string) => Promise<{ id: string }>,
  now: () => number,
) {
  try {
    const subject = await identity(request);
    const actor = await activeUser(subject);
    const command = parseCancelWbsScopeTransferCommand(await repositoryBody(request, 16_384));
    return jsonResponse(await cancelWbsScopeTransfer(store(), actor.id, command, now()));
  } catch (error) {
    if (error instanceof WbsError) return jsonResponse({ error: error.message }, error.status);
    return repositoryFailure(error);
  }
}
