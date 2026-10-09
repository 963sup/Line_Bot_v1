import { createUserManagementRequest } from "../../../../modules/account/manage.server";
import { userManagement } from "../../_composition/account.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

const memberManagementRequest = createUserManagementRequest(userManagement, requestLineIdentity);

export const GET = memberManagementRequest;
export const POST = memberManagementRequest;
