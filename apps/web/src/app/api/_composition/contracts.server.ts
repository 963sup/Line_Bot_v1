import { createPostgresContracts } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import type { ContractWebRuntime } from "../../../modules/contract/contracts-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

export const contracts: ContractWebRuntime = {
  scope: repositoryOwnerScope,
  owner: createPostgresContracts,
};
