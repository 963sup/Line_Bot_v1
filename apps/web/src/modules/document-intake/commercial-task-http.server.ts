import { createHash } from "node:crypto";
import { commercialIntakeRequest, type CommercialWebRuntime } from "./commercial-intake-http.server";

function derivedUuid(taskId: string, stage: string) {
  const hex = createHash("sha256").update(`commercial-task/1:${taskId}:${stage}`).digest("hex").split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function taskId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
    throw new Error("Commercial task ID is invalid.");
  return value.toLowerCase();
}

/** One browser task transports the existing owner commands; it owns no business state. */
export async function commercialTaskRequest(
  request: Request,
  runtime: CommercialWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const id = taskId(url.searchParams.get("taskId"));
    url.searchParams.delete("taskId");
    url.searchParams.set("commandId", derivedUuid(id, "intelligence"));
    return commercialIntakeRequest(new Request(url, request), runtime, identity);
  }
  if (request.method !== "POST") return commercialIntakeRequest(request, runtime, identity);
  const input: unknown = JSON.parse(await request.text());
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Commercial task is invalid.");
  const task = taskId(Reflect.get(input, "taskId"));
  const operation = Reflect.get(input, "operation");
  if (operation === "resume") {
    const command = {
      operation: "resume",
      repositoryId: Reflect.get(input, "repositoryId"),
      commandId: derivedUuid(task, "intelligence"),
    };
    return commercialIntakeRequest(
      new Request(url, { method: "POST", headers: request.headers, body: JSON.stringify(command) }),
      runtime,
      identity,
    );
  }
  if (operation !== "start") throw new Error("Commercial task operation is invalid.");
  const command = {
    operation: "start",
    commandId: derivedUuid(task, "intelligence"),
    repositoryId: Reflect.get(input, "repositoryId"),
    source: Reflect.get(input, "source"),
    target: {
      documentId: derivedUuid(task, "contract-document"),
      draftCommandId: derivedUuid(task, "contract-draft"),
      expectedDocumentVersion: 0,
    },
  };
  return commercialIntakeRequest(
    new Request(url, { method: "POST", headers: request.headers, body: JSON.stringify(command) }),
    runtime,
    identity,
  );
}
