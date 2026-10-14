import { createWbs } from "@line_bot_v1/wbs/application";
import { createWbsGovernance } from "@line_bot_v1/wbs/application/governance";
import {
  createPostgresWbsGovernanceStore,
  createPostgresWbsStore,
} from "@line_bot_v1/wbs/composition/bootstrap/store";
import { activeLineUser } from "./account.server";

let store: ReturnType<typeof createPostgresWbsStore> | undefined;
export const wbs = createWbs({
  activeUser: activeLineUser,
  store: () => (store ??= createPostgresWbsStore()),
  now: Date.now,
});
let governanceStore: ReturnType<typeof createPostgresWbsGovernanceStore> | undefined;
export const wbsGovernance = createWbsGovernance({
  activeUser: activeLineUser,
  store: () => (governanceStore ??= createPostgresWbsGovernanceStore()),
  now: Date.now,
});
