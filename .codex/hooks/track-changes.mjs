import { resolve } from "node:path";
import { context, digest, patchPaths, run, save } from "./runtime.mjs";

run((event) => {
  if (event.tool_name !== "apply_patch" || event.tool_response?.isError) return {};
  if (typeof event.tool_input?.command !== "string") return {};
  const { root, turn } = context(event);
  if (!turn || !event.tool_use_id)
    return {
      systemMessage:
        "Patch tracking unavailable: missing turn/tool identity. Verify modified paths manually.",
    };
  const paths = patchPaths(event.tool_input.command, event.cwd, root);
  save(resolve(turn, "edits", `${digest(event.tool_use_id)}.json`), paths);
  return {};
});
