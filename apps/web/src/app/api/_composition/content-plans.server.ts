import { createPostgresContentPlans } from "@line_bot_v1/content/composition/bootstrap/plans";
import type { ContentWebRuntime } from "../../../modules/content/content-http.server";
import { createPostgresContractDocumentExpansion } from "./contract-content-expansion.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

export const contentPlans: ContentWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () =>
    createPostgresContentPlans({
      contractDocuments: createPostgresContractDocumentExpansion,
    }),
};
