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
    target: "file" | "document",
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
    const endpoint = target === "file" ? "repository-files" : "repository-document-intake";
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
    const message =
      typeof serverMessage === "string"
        ? serverMessage
        : target === "file"
          ? "File 請求失敗。"
          : response.status === 504
            ? "採購單請求逾時，保存結果待確認；請保留此頁，使用原命令查詢回執，勿重新建立。"
            : query.operation === "read"
              ? "ContractDocument 讀取失敗。"
              : "採購單操作失敗。";
    if (response.status === 401 || response.status === 403) {
      context.onDenied(message);
      throw new StaleRequest();
    }
    const traceId: unknown = Reflect.get(fields, "traceId");
    const stage: unknown = Reflect.get(fields, "stage");
    const diagnostic =
      target === "document"
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
    const failureMessage =
      target === "document" && code === "UNKNOWN_RESULT"
        ? "解析結果尚未確認；原命令重試只會查詢已保存回執，不會重新解析。請保留此頁並聯絡管理員查核。"
        : message;
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
  };
}
