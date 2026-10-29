import { createDiscussions } from "@line_bot_v1/discussion/application/discussions";
import { PostgresDiscussionReadStore } from "@line_bot_v1/discussion/postgres";
import { authorizedRepository } from "@line_bot_v1/repository/postgres/access";
import { activeLineUser } from "./account.server";

let store: PostgresDiscussionReadStore | undefined;

export const discussions = createDiscussions({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresDiscussionReadStore(authorizedRepository)),
});
