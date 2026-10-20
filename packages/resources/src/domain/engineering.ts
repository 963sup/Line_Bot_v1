import { ObjectError } from "./error.js";

export type Quantity = Readonly<{
  measureId: string;
  value: string;
  purpose: "REFERENCE" | "PLANNED";
  sourceReference: Readonly<{ objectId: string; revisionId: string }> | null;
}>;
export type ObjectMeasure = Readonly<{
  id: string;
  repositoryId: string;
  name: string;
  subject: string;
  unit: "m" | "pcs";
  createdAt: number;
}>;
export type RelationshipKind = "REFERENCE" | "INCLUDES" | "ALLOCATES" | "LOCATED_IN";
export type EngineeringObject = Readonly<{
  objectId: string;
  revisionId: string;
  version: number;
  name: string;
  typeId: string;
  typeName: string;
  archived: boolean;
  quantity: Quantity | null;
}>;
export type EngineeringEdge = Readonly<{
  relationshipId: string;
  version: number;
  sourceObjectId: string;
  targetObjectId: string;
  kind: RelationshipKind;
}>;
export type EngineeringGraph = Readonly<{
  objects: readonly EngineeringObject[];
  edges: readonly EngineeringEdge[];
  measures: readonly ObjectMeasure[];
}>;
export type ObservedEngineering = Readonly<{
  objects: readonly Readonly<{ objectId: string; version: number }>[];
  relationships: readonly EngineeringEdge[];
}>;

function invalid(message: string): never {
  throw new ObjectError(409, message, "LIFECYCLE_CONFLICT");
}
export function quantityUnits(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/.test(value))
    throw new ObjectError(
      400,
      "數量須為非負十進位字串，整數最多 15 位、小數最多 3 位。",
      "INVALID_INPUT",
    );
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}
export function quantityValue(value: bigint): string {
  const fraction = (value % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${value / 1000n}${fraction ? `.${fraction}` : ""}`;
}
export function validateQuantity(quantity: Quantity, measure: ObjectMeasure): Quantity {
  const units = quantityUnits(quantity.value);
  if (quantity.measureId !== measure.id) invalid("找不到同一 Repository 的計量定義。");
  if (measure.unit === "pcs" && quantity.value.includes("."))
    throw new ObjectError(400, "pcs 數量必須是整數。", "INVALID_INPUT");
  return { ...quantity, value: quantityValue(units) };
}
export function createMeasure(measure: ObjectMeasure): ObjectMeasure {
  const name = measure.name.trim();
  const subject = measure.subject.trim();
  if (
    !name ||
    name.length > 100 ||
    !subject ||
    subject.length > 2000 ||
    !["m", "pcs"].includes(measure.unit)
  )
    throw new ObjectError(
      400,
      "計量名稱需為 1–100 字，計量對象與方法需為 1–2000 字，單位須為 m 或 pcs。",
      "INVALID_INPUT",
    );
  return { ...measure, name, subject };
}
export function isStructural(kind: RelationshipKind) {
  return kind === "INCLUDES" || kind === "ALLOCATES";
}

/** Validate the final state, including archived objects whose allocations remain committed. */
export function validateEngineering(graph: EngineeringGraph): void {
  const objects = new Map(graph.objects.map((object) => [object.objectId, object]));
  const measures = new Map(graph.measures.map((measure) => [measure.id, measure]));
  const parent = new Map<string, string>();
  const locations = new Set<string>();
  const allocated = new Map<string, bigint>();
  for (const object of graph.objects) {
    if (object.quantity) {
      const measure = measures.get(object.quantity.measureId);
      if (!measure) invalid("找不到計量定義。");
      validateQuantity(object.quantity, measure);
    }
  }
  for (const edge of graph.edges) {
    const source = objects.get(edge.sourceObjectId);
    const target = objects.get(edge.targetObjectId);
    if (!source || !target) invalid("找不到關係端點。");
    if (isStructural(edge.kind)) {
      if (parent.has(target.objectId)) invalid("Object 只能有一個工程結構父節點。");
      parent.set(target.objectId, source.objectId);
    }
    if (edge.kind === "LOCATED_IN") {
      if (locations.has(source.objectId))
        invalid("Object 只能有一個直接位置，跨位置工程請先拆分。");
      locations.add(source.objectId);
    }
    if (edge.kind === "ALLOCATES") {
      if (
        !source.quantity ||
        !target.quantity ||
        target.quantity.purpose !== "PLANNED" ||
        source.quantity.measureId !== target.quantity.measureId
      )
        invalid("範圍分配須使用相同計量定義，且子 Object 須有計畫數量。");
      allocated.set(
        source.objectId,
        (allocated.get(source.objectId) ?? 0n) + quantityUnits(target.quantity.value),
      );
    }
  }
  for (const [id, total] of allocated) {
    const quantity = objects.get(id)?.quantity;
    if (!quantity || total > quantityUnits(quantity.value))
      invalid("子範圍分配合計超過父 Object 數量。");
  }
  const complete = new Set<string>();
  for (const object of graph.objects) {
    const path = new Set<string>();
    let id: string | undefined = object.objectId;
    while (id && !complete.has(id)) {
      if (path.has(id)) invalid("工程結構不可循環。");
      path.add(id);
      id = parent.get(id);
    }
    for (const visited of path) complete.add(visited);
  }
}

function observationSeeds(edges: readonly EngineeringEdge[], touched: readonly string[]) {
  const original = new Set(touched);
  const seeds = new Set(touched);
  for (const edge of edges)
    if (edge.kind === "ALLOCATES" && original.has(edge.targetObjectId))
      seeds.add(edge.sourceObjectId);
  return seeds;
}
function observationEdges(edges: readonly EngineeringEdge[], seeds: ReadonlySet<string>) {
  return edges.filter(
    (edge) =>
      (edge.kind === "ALLOCATES" &&
        (seeds.has(edge.sourceObjectId) || seeds.has(edge.targetObjectId))) ||
      (edge.kind === "INCLUDES" && seeds.has(edge.targetObjectId)) ||
      (edge.kind === "LOCATED_IN" && seeds.has(edge.sourceObjectId)),
  );
}
export function observeEngineering(
  graph: EngineeringGraph,
  touched: readonly string[],
): ObservedEngineering {
  const seeds = observationSeeds(graph.edges, touched);
  const edges = observationEdges(graph.edges, seeds);
  const ids = new Set([
    ...seeds,
    ...edges.flatMap((edge) => [edge.sourceObjectId, edge.targetObjectId]),
  ]);
  return {
    objects: graph.objects
      .filter((object) => ids.has(object.objectId))
      .map(({ objectId, version }) => ({ objectId, version })),
    relationships: edges.map(
      ({ relationshipId, version, sourceObjectId, targetObjectId, kind }) => ({
        relationshipId,
        version,
        sourceObjectId,
        targetObjectId,
        kind,
      }),
    ),
  };
}

/** Compare both edge sets: a deleted relationship is also a changed allocation basis. */
export function requireObserved(
  graph: EngineeringGraph,
  touched: readonly string[],
  observed: ObservedEngineering,
) {
  const seeds = observationSeeds([...graph.edges, ...observed.relationships], touched);
  const relevant = observationEdges(graph.edges, seeds);
  const previous = observationEdges(observed.relationships, seeds);
  const ids = new Set([
    ...seeds,
    ...[...relevant, ...previous].flatMap((edge) => [edge.sourceObjectId, edge.targetObjectId]),
  ]);
  const objectVersions = new Map(
    observed.objects.map((object) => [object.objectId, object.version]),
  );
  const edgeVersions = new Map(previous.map((edge) => [edge.relationshipId, edge]));
  if (
    graph.objects.some(
      (object) =>
        ids.has(object.objectId) && objectVersions.get(object.objectId) !== object.version,
    ) ||
    relevant.length !== previous.length ||
    relevant.some((edge) => {
      const before = edgeVersions.get(edge.relationshipId);
      return (
        !before ||
        before.version !== edge.version ||
        before.sourceObjectId !== edge.sourceObjectId ||
        before.targetObjectId !== edge.targetObjectId ||
        before.kind !== edge.kind
      );
    })
  )
    throw new ObjectError(409, "工程結構或計量基準已變更，請重新載入。", "VERSION_CONFLICT");
}

export function engineeringScope(graph: EngineeringGraph, rootId: string): ReadonlySet<string> {
  if (!graph.objects.some((object) => object.objectId === rootId))
    throw new ObjectError(404, "找不到工程根節點。", "NOT_FOUND");
  const children = new Map<string, string[]>();
  for (const edge of graph.edges)
    if (isStructural(edge.kind)) {
      const values = children.get(edge.sourceObjectId) ?? [];
      values.push(edge.targetObjectId);
      children.set(edge.sourceObjectId, values);
    }
  const ids = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return ids;
}

/** A subdivided parent's unallocated remainder is retained; ancestors are never added twice. */
export function engineeringTotals(
  graph: EngineeringGraph,
  rootId: string,
  groupBy: "location" | "type",
) {
  const ids = engineeringScope(graph, rootId);
  const quantities = new Map(graph.objects.map((object) => [object.objectId, object.quantity]));
  const names = new Map(graph.objects.map((object) => [object.objectId, object.name]));
  const allocated = new Map<string, bigint>();
  const locations = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind === "LOCATED_IN") locations.set(edge.sourceObjectId, edge.targetObjectId);
    if (edge.kind === "ALLOCATES") {
      const child = quantities.get(edge.targetObjectId);
      if (child)
        allocated.set(
          edge.sourceObjectId,
          (allocated.get(edge.sourceObjectId) ?? 0n) + quantityUnits(child.value),
        );
    }
  }
  const groups = new Map<
    string,
    { key: string; name: string; measureId: string; purpose: Quantity["purpose"]; units: bigint }
  >();
  for (const object of graph.objects) {
    if (!ids.has(object.objectId) || !object.quantity) continue;
    const quantity = object.quantity;
    const remaining = quantityUnits(quantity.value) - (allocated.get(object.objectId) ?? 0n);
    if (remaining === 0n && allocated.has(object.objectId)) continue;
    const location = locations.get(object.objectId);
    const key = groupBy === "type" ? object.typeId : (location ?? "unassigned");
    const name =
      groupBy === "type"
        ? object.typeName
        : location
          ? (names.get(location) ?? "位置")
          : "未指定位置";
    const groupKey = `${key}:${quantity.measureId}:${quantity.purpose}`;
    const group = groups.get(groupKey) ?? {
      key,
      name,
      measureId: quantity.measureId,
      purpose: quantity.purpose,
      units: 0n,
    };
    group.units += remaining;
    groups.set(groupKey, group);
  }
  return [...groups.values()].map(({ units, ...group }) => ({
    ...group,
    value: quantityValue(units),
  }));
}
