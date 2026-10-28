import { type FileMutation, StaleRequest } from "./files-projection";

/** File workspace transport shares one session, scope and stale-response boundary. */
export function createFileRequests(context: {
  ownerLogin: string;
  repositoryName: string;
  epoch: { current: number };
  session(): Promise<string | null>;
  onDenied(message: string): void;
}) {
  async function send(
    target: "file" | "document" | "commercialIntake" | "commercialDocument",
    query: Record<string, string>,
    command?: object,
  ) {
    const ticket = context.epoch.current;
    const assertCurrent = () => {
      if (ticket !== context.epoch.current) throw new StaleRequest();
    };
    const session = await context.session();
    assertCurrent();
    if (!session) throw new Error("請完成 LINE 登入後重試。");
    const search = new URLSearchParams({
      ...query,
      owner: context.ownerLogin,
      name: context.repositoryName,
    });
    const endpoint = {
      file: "repository-files",
      document: "repository-document-intake",
      commercialIntake: "document-intakes",
      commercialDocument: "commercial-documents",
    }[target];
    const response = await fetch(`/api/${endpoint}?${search}`, {
      method: command ? "POST" : "GET",
      headers: {
        "X-App-Session-Generation": session,
        ...(command ? { "Content-Type": "application/json" } : {}),
      },
      ...(command ? { body: JSON.stringify(command) } : {}),
      cache: "no-store",
    });
    assertCurrent();
    let value: unknown;
    try {
      value =
        target === "file" && query.view === "download" && response.ok
          ? await response.blob()
          : response.headers.get("content-type")?.includes("application/json")
            ? await response.json()
            : await response.text();
    } catch (error) {
      assertCurrent();
      if (response.ok) throw error;
      // A malformed gateway/authentication response cannot bypass denial handling.
    }
    assertCurrent();
    if (response.ok) return value;
    const fields = value && typeof value === "object" ? value : {};
    const code: unknown = Reflect.get(fields, "code");
    const serverMessage: unknown = Reflect.get(fields, "error");
    const message = typeof serverMessage === "string" ? serverMessage : String(value);
    if (response.status === 401 || response.status === 403) {
      context.onDenied(message);
      throw new StaleRequest();
    }
    const traceId: unknown = Reflect.get(fields, "traceId");
    const stage: unknown = Reflect.get(fields, "stage");
    const diagnostic =
      target !== "file"
        ? [
            typeof stage === "string" && /^[a-z.]{1,40}$/.test(stage) ? `階段：${stage}` : "",
            typeof code === "string" && /^[A-Z_]{1,64}$/.test(code) ? `錯誤碼：${code}` : "",
            typeof traceId === "string" && /^[a-f0-9-]{36}$/.test(traceId)
              ? `追蹤 ID：${traceId}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
    const failureMessage = message;
    throw Object.assign(new Error([failureMessage, diagnostic].filter(Boolean).join("\n")), {
      status: response.status,
      code,
      stage,
      traceId,
    });
  }
  return {
    file: (query: Record<string, string> = {}, mutation?: FileMutation) =>
      send("file", query, mutation),
    document: (query: Record<string, string>, command?: object) => send("document", query, command),
    commercialIntake: (query: Record<string, string>, command?: object) =>
      send("commercialIntake", query, command),
    commercialDocument: (query: Record<string, string>) => send("commercialDocument", query),
  };
}
