export function appendCursorPage<T>(
  current: readonly T[],
  incoming: readonly T[],
  identity: (value: T) => string,
) {
  const seen = new Set(current.map(identity));
  return [...current, ...incoming.filter((value) => !seen.has(identity(value)))];
}

export function objectTypeOptions(
  types: readonly { id: string; name: string; enabled: boolean }[],
  current?: { typeId: string; typeName: string },
) {
  const options = types.map((type) => ({ ...type, current: type.id === current?.typeId }));
  if (current && !options.some((type) => type.current))
    options.push({ id: current.typeId, name: current.typeName, enabled: false, current: true });
  return options;
}
