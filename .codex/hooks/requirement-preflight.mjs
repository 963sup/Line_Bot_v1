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
        "Before edits, apply AGENTS.md Primary agent requirement preflight. For substantial work use requirement-architect when available; otherwise perform it and disclose the limitation. Reuse one plan and working Serena sessions. Prefer native MCP tools; missing tools require checking user registration and host refresh before reinstalling or assuming incompatibility. Continue authorized execution. This reminder is not evidence review or MCP acceptance ran.",
    },
  };
});
