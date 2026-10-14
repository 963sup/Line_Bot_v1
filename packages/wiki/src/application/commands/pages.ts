import type { WikiCommand } from "../../contracts/dto/wiki.js";
import { WikiError } from "../../domain/wiki-page.js";

export function parseWikiCommand(input: unknown): WikiCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WikiError(400, "Invalid Wiki command.");
  const v: Record<string, unknown> = { ...input };
  if (
    typeof v.repositoryId !== "string" ||
    !v.repositoryId ||
    v.repositoryId.length > 128 ||
    typeof v.pageId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.pageId) ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.requestId) ||
    typeof v.expectedVersion !== "number" ||
    !Number.isSafeInteger(v.expectedVersion) ||
    v.expectedVersion < 0 ||
    v.expectedVersion >= 2147483647
  )
    throw new WikiError(400, "Invalid Wiki scope, request identity or version.");
  const base = {
    repositoryId: v.repositoryId,
    pageId: v.pageId.toLowerCase(),
    requestId: v.requestId.toLowerCase(),
    expectedVersion: v.expectedVersion,
  };
  let command: WikiCommand;
  if (
    (v.action === "create" || v.action === "edit") &&
    typeof v.title === "string" &&
    typeof v.body === "string"
  )
    command = { ...base, action: v.action, title: v.title, body: v.body };
  else if (v.action === "rename" && typeof v.title === "string")
    command = { ...base, action: v.action, title: v.title };
  else if (v.action === "archive") command = { ...base, action: v.action };
  else if (
    v.action === "restore" &&
    typeof v.revisionId === "string" &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.revisionId)
  )
    command = { ...base, action: v.action, revisionId: v.revisionId.toLowerCase() };
  else throw new WikiError(400, "Invalid Wiki action.");
  if (Object.keys(v).some((k) => !Object.hasOwn(command, k)))
    throw new WikiError(400, "Unknown Wiki command field.");
  return command;
}
