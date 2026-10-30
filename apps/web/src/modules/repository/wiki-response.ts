import { booleanValue, record, stringValue } from "@line_bot_v1/platform/validation";

export function wikiScope(value: unknown) {
  const v = record(value),
    repository = record(v.repository);
  return {
    actorUserId: stringValue(v.actorUserId),
    repository: {
      id: stringValue(repository.id),
      ownerLogin: stringValue(repository.ownerLogin),
      name: stringValue(repository.name),
    },
    canEdit: booleanValue(v.canEdit),
    archived: booleanValue(v.archived),
    canManageRepository: booleanValue(v.canManageRepository),
  };
}
