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
import { repositoryBody, repositoryFailure } from "./http.server";

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
) {
  try {
    const subject = await identity(request);
    const actor = await activeUser(subject);
    const repositoryId = new URL(request.url).searchParams.get("repositoryId");
    if (!repositoryId) throw new WbsError(400, "repositoryId is required");
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
