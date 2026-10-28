import { UserError } from "@line_bot_v1/account/domain/user";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { logServerError } from "../../../shared/observability/runtime-error.server";
import { RequestIdentityError } from "../../../shared/server/request-identity-error";
import { repositoryOwnerScope } from "./repository-owner-scope.server";
import { requestLineIdentity } from "./request-identity.server";

/** Host capabilities shared by Repository-scoped HTTP adapters. */
export function repositoryRequestContext(service: string) {
  return {
    identity: requestLineIdentity,
    scope: repositoryOwnerScope,
    origin: () => process.env.APP_ORIGIN,
    knownErrors: [UserError, RepositoryError, RequestIdentityError],
    observeError: (error: unknown, status: number) =>
      logServerError(error, { service, operation: "request", status }),
  };
}
