import { createRepositoryAddress } from "@line_bot_v1/repository/application/address";
import { PostgresRepositoryAddressStore } from "@line_bot_v1/repository/postgres/address";
import { activeLineUser } from "./account.server";

let store: PostgresRepositoryAddressStore | undefined;

export const repositoryAddress = createRepositoryAddress({
  activeUser: activeLineUser,
  store: () => (store ??= new PostgresRepositoryAddressStore()),
  now: Date.now,
});
