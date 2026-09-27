import { PostgresProjectCollectionStore } from "@line_bot_v1/project/adapters/postgres/collection";
import { createProjectCollection } from "@line_bot_v1/project/application/collection";
import { activeLineUser } from "./account.server";

let store: PostgresProjectCollectionStore | undefined;

export const projectCollection = createProjectCollection({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresProjectCollectionStore()),
});
