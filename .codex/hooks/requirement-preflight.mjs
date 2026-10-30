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
        "Before edits, apply AGENTS.md Primary agent requirement preflight for every new request or scope change. Confirm scope, owners, consumers and acceptance. Continue authorized work without repeated approval at batch boundaries. Reuse working Serena sessions. This reminder is not evidence review or MCP acceptance ran.",
    },
  };
});
