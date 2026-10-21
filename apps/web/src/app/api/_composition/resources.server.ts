import { createResources } from "@line_bot_v1/resources/application/use-cases/resources";
import { createPostgresResourceDependencies } from "@line_bot_v1/resources/composition/bootstrap/resources";
import type { ResourceWebRuntime } from "../../../modules/resources/resources-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let dependencies: ReturnType<typeof createPostgresResourceDependencies> | undefined;
const resourceDependencies = () => (dependencies ??= createPostgresResourceDependencies());

export const resources: ResourceWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () => createResources({ ...resourceDependencies(), now: Date.now }),
};
