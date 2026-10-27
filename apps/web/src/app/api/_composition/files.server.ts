import { UserError } from "@line_bot_v1/account/domain/user";
import { createPostgresFileHttpHandler } from "@line_bot_v1/file/composition/bootstrap/files";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { captureHandledServerError } from "../../../shared/observability/server-error";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import { repositoryOwnerScope } from "./repository-owner-scope.server";
import { requestLineIdentity } from "./request-identity.server";

export const filesRequest = createPostgresFileHttpHandler({
  identity: requestLineIdentity,
  scope: repositoryOwnerScope,
  origin: () => process.env.APP_ORIGIN,
  knownErrors: [UserError, RepositoryError, RequestIdentityError],
  observeError: (error, status) =>
    captureHandledServerError(error, {
      service: "repository-files-api",
      operation: "request",
      status,
    }),
});
