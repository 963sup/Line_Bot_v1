import { createContentPlans } from "@line_bot_v1/content/application/use-cases/plans";
import { createPostgresContentPlanDependencies } from "@line_bot_v1/content/composition/bootstrap/plans";
import type { ContentWebRuntime } from "../../../modules/content/content-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let dependencies: ReturnType<typeof createPostgresContentPlanDependencies> | undefined;
const contentDependencies = () => (dependencies ??= createPostgresContentPlanDependencies());

export const contentPlans: ContentWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () => createContentPlans({ ...contentDependencies(), now: Date.now }),
};
