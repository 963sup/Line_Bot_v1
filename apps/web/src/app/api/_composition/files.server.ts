import { fileHttpRequest } from "@line_bot_v1/file/adapters/inbound/http";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import type { FilesWebRuntime } from "../../../modules/file/files-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let owner: ReturnType<typeof createFiles> | undefined;
const fileOwner = () =>
  (owner ??= createFiles({ ...createPostgresFileDependencies(), now: Date.now }));

export const files: FilesWebRuntime = {
  scope: repositoryOwnerScope,
  owner: fileOwner,
  dispatch: fileHttpRequest,
};
