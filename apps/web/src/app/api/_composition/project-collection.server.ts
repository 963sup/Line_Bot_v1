import { createProjectCollection } from "@line_bot_v1/project/application/queries/project-collection";
import { createPostgresProjectCollectionStore } from "@line_bot_v1/project/composition/bootstrap/postgres-project-collection-store";
import { activeLineUser } from "./account.server";

let store: ReturnType<typeof createPostgresProjectCollectionStore> | undefined;

export const projectCollection = createProjectCollection({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresProjectCollectionStore()),
});
