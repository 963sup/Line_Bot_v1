import { createUserManagementRequest } from "../../../../modules/account/manage.server";
import { activeLineUser } from "../../_composition/account.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

const memberManagementRequest = createUserManagementRequest(activeLineUser, requestLineIdentity);

export const GET = memberManagementRequest;
export const POST = memberManagementRequest;
