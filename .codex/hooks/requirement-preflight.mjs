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
        "Apply AGENTS.md preflight when scope or safety is genuinely ambiguous. For explicitly authorized docs restructuring, do not repeat planning or request approval at batch boundaries; continue the complete migration with scoped verification. Reuse working Serena sessions. This reminder is not evidence review or MCP acceptance.",
    },
  };
});
