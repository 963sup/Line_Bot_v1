import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import { createPostgresIntelligenceProcessing } from "@line_bot_v1/intelligence/composition/bootstrap/processing";
import { plainTextProcessor } from "@line_bot_v1/intelligence/composition/bootstrap/processors";
import { createVercelAiGateway } from "../../../../../../vercel/integrations/gateway.ts";
import type { FilesWebRuntime } from "../../../modules/file/files-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let dependencies: ReturnType<typeof createPostgresFileDependencies> | undefined;
const fileDependencies = () => (dependencies ??= createPostgresFileDependencies());

export const files: FilesWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () => createFiles({ ...fileDependencies(), now: Date.now }),
  processors: () => {
    const processors = [plainTextProcessor];
    const model = process.env.AI_GATEWAY_MODEL;
    if (model) processors.push(createVercelAiGateway({ model }).fileProcessor());
    return processors;
  },
  processingOwner: () => createPostgresIntelligenceProcessing(),
};
