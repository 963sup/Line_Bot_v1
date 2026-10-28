import { randomUUID } from "node:crypto";

/** Bounded server diagnostics with no dependency on an external telemetry service. */
export function logServerError(
  error: unknown,
  context: { service: string; operation: string; status: number; code?: string; traceId?: string },
) {
  if (context.status < 500) return;
  const traceId = context.traceId ?? randomUUID();
  const errors: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  for (let current = error; current && !seen.has(current) && errors.length < 3; ) {
    seen.add(current);
    const diagnostic: Record<string, unknown> = {};
    const name = field(current, "name");
    diagnostic.type = typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
    const code = field(current, "code");
    if (typeof code === "string" && /^[A-Z0-9_]{1,48}$/.test(code)) diagnostic.code = code;
    for (const key of ["schema", "table", "column", "constraint", "dataType", "routine"]) {
      const value = field(current, key);
      if (typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_.]{0,95}$/.test(value))
        diagnostic[key] = value;
    }
    const message = field(current, "message");
    if (typeof message === "string") {
      // Discard the whole quoted value tail, including embedded quotes. Never log
      // detail, query, parameters, arbitrary application messages, or a raw Error.
      const firstLine = message.slice(0, 1200).split(/[\r\n]/, 1)[0] ?? "";
      if (
        typeof code === "string" &&
        /^[0-9A-Z]{5}$/.test(code) &&
        /^(?:invalid |relation |column |function |operator |permission denied|duplicate key|new row |null value|value too long|bind |syntax error|current transaction|deadlock|could not |cannot |connection |terminating |remaining connection|canceling statement|cached plan)/i.test(
          firstLine,
        )
      ) {
        diagnostic.message = firstLine
          .replace(/["'`].*$/, "[redacted]")
          .replace(/https?:\/\/\S+|\b[A-Za-z0-9_+./=-]{32,}\b/g, "[redacted]")
          .replace(/\b(?:SELECT|INSERT|UPDATE|DELETE|WITH)\s.+/gi, "[SQL omitted]")
          .slice(0, 400);
      } else if (
        /^(?:Expected [A-Za-z ]+|Invalid stored [A-Za-z ]+\.?|Unsupported Contract document schema version\.)$/.test(
          firstLine,
        )
      ) {
        diagnostic.message = firstLine.slice(0, 160);
      }
    }
    const stack = field(current, "stack");
    if (typeof stack === "string") {
      diagnostic.frames = stack
        .slice(0, 12000)
        .split("\n")
        .filter((line) => /^\s*at /.test(line))
        .map((line) => line.match(/([A-Za-z0-9_@./:\\-]+:\d+:\d+)\)?$/)?.[1])
        .filter((frame): frame is string => Boolean(frame))
        .slice(0, 4)
        .map((frame) => frame.replaceAll("\\", "/").split("/").slice(-3).join("/").slice(-160));
    }
    errors.push(diagnostic);
    current = field(current, "cause");
  }
  console.error(
    JSON.stringify({
      event: "server_error",
      ...context,
      stage: context.operation,
      traceId,
      errors,
    }),
  );
  return traceId;
}

function field(value: unknown, key: string): unknown {
  try {
    return value && typeof value === "object" ? Reflect.get(value, key) : undefined;
  } catch {
    return undefined;
  }
}
