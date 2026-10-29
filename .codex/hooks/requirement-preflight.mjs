import { resolve } from "node:path";
import { context, run, save } from "./runtime.mjs";

run((event) => {
  const { base, turn } = context(event);
  // Record delivery only, never the user's prompt or a claim that planning ran.
  save(resolve(turn ?? base, "requirement-preflight.json"), {
    event: "UserPromptSubmit",
    deliveredAt: new Date().toISOString(),
    hasTurnId: Boolean(event.turn_id),
  });
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        "Before edits, apply AGENTS.md Primary agent requirement preflight. For substantial cross-owner or ambiguous work, delegate read-only requirement-architect review when available; otherwise perform it and disclose the limitation. Reuse one plan; define scope, evidence, owners, additions/changes/removals and acceptance. Continue authorized execution. Reuse working Serena capabilities; do not routinely reindex or reload manuals. This reminder is not evidence the review ran.",
    },
  };
});
