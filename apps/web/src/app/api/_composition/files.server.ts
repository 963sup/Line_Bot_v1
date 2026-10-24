import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import { plainTextProcessor } from "@line_bot_v1/file/composition/bootstrap/processors";
import { createGeminiFileProcessor } from "@line_bot_v1/intelligence/composition/bootstrap/processors";
import type { FilesWebRuntime } from "../../../modules/file/files-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let dependencies: ReturnType<typeof createPostgresFileDependencies> | undefined;
const fileDependencies = () => (dependencies ??= createPostgresFileDependencies());

export const files: FilesWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () => createFiles({ ...fileDependencies(), now: Date.now }),
  processors: () => {
    const processors = [plainTextProcessor];
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;
    if (apiKey && model) processors.push(createGeminiFileProcessor({ apiKey, model }));
    return processors;
  },
};
