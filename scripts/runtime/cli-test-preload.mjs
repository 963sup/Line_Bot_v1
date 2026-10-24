import { registerHooks } from "node:module";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const mocked = new Set([
  "@line_bot_v1/account/postgres",
  "@line_bot_v1/file/application/use-cases/files",
  "@line_bot_v1/file/composition/bootstrap/files",
  "@line_bot_v1/file/composition/bootstrap/processors",
  "@line_bot_v1/intelligence/composition/bootstrap/processors",
  "@line_bot_v1/file/domain/error",
  "@line_bot_v1/file/domain/file",
  "@line_bot_v1/contract/application/use-cases/contracts",
  "@line_bot_v1/contract/composition/bootstrap/contracts",
  "@line_bot_v1/contract/domain/error",
  "@line_bot_v1/execution/application/use-cases/executions",
  "@line_bot_v1/execution/application/use-cases/task-dependencies",
  "@line_bot_v1/execution/composition/bootstrap/executions",
  "@line_bot_v1/execution/composition/bootstrap/task-dependencies",
  "@line_bot_v1/execution/domain/error",
  "@line_bot_v1/line/identity",
  "@line_bot_v1/line/mini-app",
  "@line_bot_v1/line/provider",
  "@line_bot_v1/platform/postgres",
]);

function operationSource(
  owner,
  factory = owner === "contract" ? "createContracts" : "createExecutions",
) {
  const errorName =
    owner === "contract" ? "ContractError" : owner === "file" ? "FileError" : "ExecutionError";
  return `
    import { ${errorName} } from "@line_bot_v1/${owner}/domain/error";
    const scenario = process.env.CLI_SCENARIO;
    let calls = 0;
    function invoke(operation, actor, input) {
      calls += 1;
      const typed = /^owner-typed:(\\d+):([A-Z_]+)$/.exec(scenario ?? "");
      if (typed) throw new ${errorName}(Number(typed[1]), "TOP_SECRET", typed[2]);
      if (scenario === "owner-unavailable") throw new ${errorName}(503, "TOP_SECRET", "UNAVAILABLE");
      if (scenario === "fake-error") throw { status: 418, code: "FORGED", message: "TOP_SECRET" };
      if (scenario === "operation-error") throw new Error("TOP_SECRET");
      return { owner: "${owner}", operation, actor, input, calls };
    }
    export function ${factory}() {
      if (scenario === "factory-error") throw new Error("TOP_SECRET");
      return {
        file: async (actor, query) => invoke("file", actor, query),
        ${owner === "file" ? 'pendingUploads: async (actor, scope) => invoke("pendingUploads", actor, scope),' : ""}
        processing: async (actor, query) => invoke("processing", actor, query),
        result: async (actor, command) => invoke("result", actor, command),
        run: async (actor, command) => invoke("run", actor, command),
        execute: async (actor, command) => invoke("execute", actor, command),
        read: async (actor, query) => invoke("read", actor, query),
        list: async (actor, query) => invoke("list", actor, query),
        history: async (actor, query) => invoke("history", actor, query),
      };
    }
  `;
}

function sourceFor(url) {
  const specifier = url.slice("cli-test:".length);
  if (specifier === "@line_bot_v1/file/domain/error")
    return `export class FileError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }`;
  if (specifier === "@line_bot_v1/file/domain/file")
    return `export const fileLimits = { bytes: 47185920 };`;
  if (specifier === "@line_bot_v1/file/application/use-cases/files")
    return operationSource("file", "createFiles");
  if (specifier === "@line_bot_v1/file/composition/bootstrap/files")
    return `export function createPostgresFileDependencies() { return {}; }`;
  if (specifier === "@line_bot_v1/file/composition/bootstrap/processors")
    return `export const plainTextProcessor = {};`;
  if (specifier === "@line_bot_v1/intelligence/composition/bootstrap/processors")
    return `export function createGeminiFileProcessor() { return {}; }`;
  if (specifier === "@line_bot_v1/contract/domain/error")
    return `export class ContractError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }`;
  if (specifier === "@line_bot_v1/execution/domain/error")
    return `export class ExecutionError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }`;
  if (specifier.endsWith("/application/use-cases/contracts")) return operationSource("contract");
  if (specifier.endsWith("/application/use-cases/executions")) return operationSource("execution");
  if (specifier.endsWith("/application/use-cases/task-dependencies"))
    return operationSource("execution", "createTaskDependencies");
  if (specifier.endsWith("/composition/bootstrap/contracts"))
    return `export function createPostgresContractDependencies() { return {}; }`;
  if (specifier.endsWith("/composition/bootstrap/executions"))
    return `export function createPostgresExecutionDependencies() { return {}; }`;
  if (specifier.endsWith("/composition/bootstrap/task-dependencies"))
    return `export function createPostgresTaskDependencyDependencies() { return {}; }`;
  if (specifier === "@line_bot_v1/platform/postgres")
    return `
      export class PostgresDatabase {
        constructor() { if (process.env.CLI_SCENARIO === "db-constructor") throw new Error("TOP_SECRET"); }
        async transaction(work) { return work({}); }
        async close() {
          globalThis.__cliDatabaseClosed = true;
          if (process.env.CLI_SCENARIO === "cleanup-error") throw new Error("TOP_SECRET_CLEANUP");
        }
      }
    `;
  if (specifier === "@line_bot_v1/line/identity")
    return `
      export class LineIdentityError extends Error { status = 401; }
      export class LineIdentityUnavailableError extends Error { status = 503; }
      export async function verifyLiffUser() {
        if (process.env.CLI_SCENARIO === "auth-invalid") throw new LineIdentityError("TOP_SECRET");
        if (process.env.CLI_SCENARIO === "auth-unavailable") throw new LineIdentityUnavailableError("TOP_SECRET");
        return "line-subject";
      }
    `;
  if (specifier === "@line_bot_v1/line/mini-app")
    return `export function lineMiniApp() { return { channelId: "test-channel" }; }`;
  if (specifier === "@line_bot_v1/line/provider")
    return `export const LINE_PROVIDER_NAMESPACE = "line:test";`;
  if (specifier === "@line_bot_v1/account/postgres")
    return `
      export async function readUserByIdentity() {
        if (process.env.CLI_SCENARIO?.startsWith("auth-")) throw new Error("ACCOUNT_QUERIED");
        if (process.env.CLI_SCENARIO === "user-missing") return undefined;
        if (process.env.CLI_SCENARIO === "user-inactive") return { id: "user-id", status: "inactive" };
        return { id: "user-id", status: "active" };
      }
    `;
  throw new Error(`Unexpected CLI test module: ${specifier}`);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocked.has(specifier)) return { url: `cli-test:${specifier}`, shortCircuit: true };
    const resolved = nextResolve(
      isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier,
      context,
    );
    if (isAbsolute(resolved.url)) return { ...resolved, url: pathToFileURL(resolved.url).href };
    return resolved;
  },
  load(url, context, nextLoad) {
    if (url.startsWith("cli-test:"))
      return { format: "module", source: sourceFor(url), shortCircuit: true };
    return nextLoad(url, context);
  },
});

if (process.env.CLI_SCENARIO === "expect-close") {
  process.on("exit", () => {
    if (!globalThis.__cliDatabaseClosed) process.stderr.write("database was not closed\n");
  });
}
