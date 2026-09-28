import { resolveNamespace } from "@line_bot_v1/namespace";
import { PostgresNamespaceStore } from "@line_bot_v1/namespace/postgres";
import { businessDatabase } from "@line_bot_v1/platform/postgres";

export function resolveAccountNamespace(login: string) {
  return businessDatabase().transaction((sql) =>
    resolveNamespace(new PostgresNamespaceStore(sql), login),
  );
}
