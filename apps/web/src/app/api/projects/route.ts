import { createProjectCollection } from "@line_bot_v1/project/application/queries/project-collection";
import { createPostgresProjectCollectionStore } from "@line_bot_v1/project/composition/bootstrap/postgres-project-collection-store";
import { projectFailure } from "../../../modules/project/http.server";
import { jsonResponse } from "../../../shared/server/http";
import { activeLineUser } from "../_composition/account.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

let store: ReturnType<typeof createPostgresProjectCollectionStore> | undefined;

const projectCollection = createProjectCollection({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresProjectCollectionStore()),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return jsonResponse(await projectCollection.accessible(await requestLineIdentity(request)));
  } catch (error) {
    return projectFailure(error);
  }
}
