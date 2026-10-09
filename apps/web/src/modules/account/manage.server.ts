import type { UserManagementUseCases } from "@line_bot_v1/account/application/manage-users";
import type { UserManagementQuery } from "@line_bot_v1/account/contracts/user-management";
import { UserError } from "@line_bot_v1/account/domain/user";
import { jsonResponse } from "../../shared/server/http";
import { apiError, readJsonBody } from "./http.server";

export function createUserManagementRequest(
  management: UserManagementUseCases,
  requestIdentity: (request: Request) => Promise<string>,
) {
  return async (request: Request) => {
    try {
      if (request.method === "POST") {
        const body = await readJsonBody(request, 4096);
        return jsonResponse(await management.execute(await requestIdentity(request), body));
      }
      const params = new URL(request.url).searchParams;
      if (
        [...params.keys()].some((key) => !["id", "status", "after"].includes(key)) ||
        [...params.keys()].some((key) => params.getAll(key).length > 1)
      ) {
        throw new UserError(400, "會員查詢條件不正確。");
      }
      return jsonResponse(
        await management.view(
          await requestIdentity(request),
          Object.fromEntries(params) as UserManagementQuery,
        ),
      );
    } catch (error) {
      return apiError(error);
    }
  };
}
