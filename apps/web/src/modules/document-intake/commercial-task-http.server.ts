import {
  commercialTaskCommand,
  commercialTaskCommandId,
} from "@line_bot_v1/intelligence/application/commands/commercial-task";
import {
  type CommercialWebRuntime,
  commercialIntakeRequest,
} from "./commercial-intake-http.server";

/** One browser task transports the existing owner commands; it owns no business state. */
export async function commercialTaskRequest(
  request: Request,
  runtime: CommercialWebRuntime,
  identity: (request: Request) => Promise<string>,
) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const commandId = commercialTaskCommandId(url.searchParams.get("taskId"));
    url.searchParams.delete("taskId");
    url.searchParams.set("commandId", commandId);
    return commercialIntakeRequest(new Request(url, request), runtime, identity);
  }
  if (request.method !== "POST") return commercialIntakeRequest(request, runtime, identity);
  const input: unknown = JSON.parse(await request.text());
  const command = commercialTaskCommand(input);
  return commercialIntakeRequest(
    new Request(url, { method: "POST", headers: request.headers, body: JSON.stringify(command) }),
    runtime,
    identity,
  );
}
