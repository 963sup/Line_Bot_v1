import { createProjectCollection } from "@line_bot_v1/project/application/collection";
import { PostgresProjectCollectionStore } from "@line_bot_v1/project/postgres/collection";
import { activeLineUser } from "./account.server";

let store: PostgresProjectCollectionStore | undefined;

export const projectCollection = createProjectCollection({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresProjectCollectionStore()),
});
