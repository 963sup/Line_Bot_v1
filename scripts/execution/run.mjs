import { createExecutions } from "@line_bot_v1/execution/application/use-cases/executions";
import { createTaskDependencies } from "@line_bot_v1/execution/application/use-cases/task-dependencies";
import { createPostgresExecutionDependencies } from "@line_bot_v1/execution/composition/bootstrap/executions";
import { createPostgresTaskDependencyDependencies } from "@line_bot_v1/execution/composition/bootstrap/task-dependencies";
import { ExecutionError } from "@line_bot_v1/execution/domain/error";
import { InternalInputError } from "../runtime/internal-input.mjs";
import { runInternalOperation } from "../runtime/internal-operation.mjs";

const output = await runInternalOperation({
  errorMessage: "Execution operation failed; no credential or provider payload is logged.",
  errorClass: ExecutionError,
  operation: async ({ db, input, actor, markMutation }) => {
  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: Date.now,
  });
  let result;
  if (input.operation === "replace-dependencies") {
    const dependencies = createTaskDependencies({
      ...createPostgresTaskDependencyDependencies(db),
      now: Date.now,
    });
    markMutation();
    result = await dependencies.execute(actor, input.command);
  } else if (input.operation === "dependencies") {
    const dependencies = createTaskDependencies({
      ...createPostgresTaskDependencyDependencies(db),
      now: Date.now,
    });
    result = await dependencies.read(actor, input.query);
  } else if (input.operation === "execute") {
    markMutation();
    result = await executions.execute(actor, input.command);
  } else if (input.operation === "read") result = await executions.read(actor, input.query);
  else if (input.operation === "list")
    result = await executions.list(actor, input.query, input.after);
  else if (input.operation === "history")
    result = await executions.history(actor, input.query, input.before);
  else throw new InternalInputError("Unknown Execution operation.");
  return result;
  },
});

(output.ok ? console.log : console.error)(JSON.stringify(output));
if (!output.ok) process.exitCode = 1;
