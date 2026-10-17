import { isRecord, literalValue, stringArray, stringValue } from "@line_bot_v1/platform/validation";
import { ProjectActionsError, ruleDefinition } from "../../domain/project-automation.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function projectActionCommand(value: unknown) {
  if (!isRecord(value)) throw new ProjectActionsError(400, "命令不正確。");
  try {
    const action = literalValue(value.action, ["define", "execute", "cancel", "retry"]),
      projectId = stringValue(value.projectId),
      id = stringValue(value.id),
      requestId = stringValue(value.requestId);
    if (
      !projectId ||
      projectId.length > 128 ||
      !uuid.test(id) ||
      !uuid.test(requestId) ||
      !Number.isSafeInteger(value.expectedVersion) ||
      typeof value.expectedVersion !== "number" ||
      value.expectedVersion < 0
    )
      throw new Error();
    const base = { action, projectId, id, requestId, expectedVersion: value.expectedVersion };
    const allowed = [
      "action",
      "projectId",
      "id",
      "requestId",
      "expectedVersion",
      ...(action === "define"
        ? ["kind", "recipients", "enabled"]
        : action === "execute"
          ? ["revisionId"]
          : []),
    ];
    if (Object.keys(value).some((k) => !allowed.includes(k))) throw new Error();
    if (action === "define") {
      const kind = literalValue(value.kind, ["check-wbs-revision", "notify-wbs-baseline"]);
      if (typeof value.enabled !== "boolean") throw new Error();
      return {
        ...base,
        action,
        kind,
        recipients: ruleDefinition(kind, stringArray(value.recipients)),
        enabled: value.enabled,
      };
    }
    if (action === "execute") {
      const revisionId = stringValue(value.revisionId);
      if (!uuid.test(revisionId)) throw new Error();
      return { ...base, action, revisionId };
    }
    return { ...base, action };
  } catch {
    throw new ProjectActionsError(400, "命令欄位不正確。");
  }
}
