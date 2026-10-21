import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import type { ContractWebRuntime } from "../../../modules/contract/contracts-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let dependencies: ReturnType<typeof createPostgresContractDependencies> | undefined;
const contractDependencies = () => (dependencies ??= createPostgresContractDependencies());

export const contracts: ContractWebRuntime = {
  scope: repositoryOwnerScope,
  owner: () => createContracts({ ...contractDependencies(), now: Date.now }),
};
