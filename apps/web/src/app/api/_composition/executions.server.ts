import { createExecutions } from "@line_bot_v1/execution/application/use-cases/executions";
import { createTaskDependencies } from "@line_bot_v1/execution/application/use-cases/task-dependencies";
import { createPostgresExecutionDependencies } from "@line_bot_v1/execution/composition/bootstrap/executions";
import { createPostgresTaskDependencyDependencies } from "@line_bot_v1/execution/composition/bootstrap/task-dependencies";
import type { ExecutionWebRuntime } from "../../../modules/execution/executions-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let dependencies: ReturnType<typeof createPostgresExecutionDependencies> | undefined;
const executionDependencies = () => (dependencies ??= createPostgresExecutionDependencies());
let taskDependencies: ReturnType<typeof createPostgresTaskDependencyDependencies> | undefined;
const dependencyStore = () => (taskDependencies ??= createPostgresTaskDependencyDependencies());

export const executions: ExecutionWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () => createExecutions({ ...executionDependencies(), now: Date.now }),
  dependencies: () => createTaskDependencies({ ...dependencyStore(), now: Date.now }),
};
