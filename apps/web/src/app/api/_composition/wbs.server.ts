import { createWbs } from "@line_bot_v1/wbs/application";
import { createPostgresWbsStore } from "@line_bot_v1/wbs/composition/bootstrap/store";
import { activeLineUser } from "./account.server";

let store: ReturnType<typeof createPostgresWbsStore> | undefined;
export const wbs = createWbs({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresWbsStore()),
  now: Date.now,
});
