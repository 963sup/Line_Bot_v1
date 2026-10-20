import assert from "node:assert/strict";
import test from "node:test";
import {
  type EngineeringGraph,
  type EngineeringObject,
  engineeringTotals,
  observeEngineering,
  type Quantity,
  requireObserved,
  validateEngineering,
  validateQuantity,
} from "../src/domain/engineering.js";
import { ObjectError } from "../src/domain/error.js";
import { quantityUnits } from "../src/domain/quantity.js";

const measure = {
  id: "fibre",
  repositoryId: "repo",
  name: "光纖敷設",
  subject: "沿路徑量測的光纖長度",
  unit: "m" as const,
  createdAt: 1,
};
const quantity = (
  value: string,
  purpose: Quantity["purpose"] = "PLANNED",
  measureId = measure.id,
): Quantity => ({ measureId, value, purpose, sourceReference: null });
function object(
  objectId: string,
  value: string,
  purpose: Quantity["purpose"] = "PLANNED",
): EngineeringObject {
  return {
    objectId,
    revisionId: `${objectId}-1`,
    version: 1,
    name: objectId,
    typeId: "laying",
    typeName: "敷設",
    archived: false,
    quantity: quantity(value, purpose),
  };
}
function example(): EngineeringGraph {
  return {
    measures: [measure],
    objects: [
      object("A", "8500", "REFERENCE"),
      object("B", "2000"),
      object("C", "1000"),
      object("D", "3000"),
      object("E", "2000"),
      object("B1", "1200"),
      object("B2", "800"),
    ],
    edges: [
      ["A", "B"],
      ["A", "C"],
      ["A", "D"],
      ["A", "E"],
      ["B", "B1"],
      ["B", "B2"],
    ].map(([sourceObjectId = "", targetObjectId = ""]) => ({
      relationshipId: `${sourceObjectId}-${targetObjectId}`,
      version: 1,
      sourceObjectId,
      targetObjectId,
      kind: "ALLOCATES",
    })),
  };
}
test("exact decimal arithmetic rejects excess precision, negatives, exponents and fractional pcs", () => {
  assert.equal(quantityUnits("999999999999999.999"), 999999999999999999n);
  assert.equal(quantityUnits("0.1") + quantityUnits("0.2"), quantityUnits("0.3"));
  for (const value of ["-1", "1e3", "1.0001", "01", "", "1000000000000000"])
    assert.throws(() => quantityUnits(value));
  for (const value of ["0.1", "1.0"])
    assert.throws(() => validateQuantity(quantity(value), { ...measure, unit: "pcs" }));
  assert.equal(validateQuantity(quantity("0"), measure).value, "0");
});
test("quantity validation keeps format, measure and unit errors in that order", () => {
  const pieces = { ...measure, unit: "pcs" as const };
  assert.throws(
    () => validateQuantity(quantity("invalid", "PLANNED", "other"), pieces),
    (error) => error instanceof ObjectError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => validateQuantity(quantity("1.0", "PLANNED", "other"), pieces),
    (error) =>
      error instanceof ObjectError &&
      error.code === "LIFECYCLE_CONFLICT" &&
      error.message === "找不到同一 Repository 的計量定義。",
  );
  assert.throws(
    () => validateQuantity(quantity("1.0"), pieces),
    (error) =>
      error instanceof ObjectError &&
      error.code === "INVALID_INPUT" &&
      error.message === "pcs 數量必須是整數。",
  );
});
test("nested frontier keeps 8000 planned metres and 500 reference residual without double counting", () => {
  const graph = example();
  validateEngineering(graph);
  assert.deepEqual(engineeringTotals(graph, "A", "location"), [
    {
      key: "unassigned",
      name: "未指定位置",
      measureId: "fibre",
      purpose: "REFERENCE",
      value: "500",
    },
    {
      key: "unassigned",
      name: "未指定位置",
      measureId: "fibre",
      purpose: "PLANNED",
      value: "8000",
    },
  ]);
  const partial = {
    ...graph,
    objects: graph.objects.filter((object) => object.objectId !== "B2"),
    edges: graph.edges.filter((edge) => edge.targetObjectId !== "B2"),
  };
  validateEngineering(partial);
  assert.equal(
    engineeringTotals(partial, "A", "type").find((group) => group.purpose === "PLANNED")?.value,
    "8000",
  );
});
test("location does not inherit, archived scope still consumes budget, support measures stay separate", () => {
  const base = example();
  const graph: EngineeringGraph = {
    ...base,
    measures: [
      ...base.measures,
      { ...measure, id: "termination", unit: "pcs" },
      { ...measure, id: "sleeve", unit: "pcs" },
    ],
    objects: [
      ...base.objects.map((object) =>
        object.objectId === "B" ? { ...object, archived: true } : object,
      ),
      { ...object("F", "8"), quantity: quantity("8", "PLANNED", "termination") },
      { ...object("G", "8"), quantity: quantity("8", "PLANNED", "sleeve") },
      { ...object("room", "0"), name: "電氣室", quantity: null },
    ],
    edges: [
      ...base.edges,
      {
        relationshipId: "loc",
        version: 1,
        sourceObjectId: "B",
        targetObjectId: "room",
        kind: "LOCATED_IN",
      },
      ...["F", "G"].map((id) => ({
        relationshipId: id,
        version: 1,
        sourceObjectId: "A",
        targetObjectId: id,
        kind: "INCLUDES" as const,
      })),
    ],
  };
  validateEngineering(graph);
  const groups = engineeringTotals(graph, "A", "location");
  assert.equal(
    groups.find((group) => group.measureId === "fibre" && group.purpose === "PLANNED")?.key,
    "unassigned",
  );
  assert.deepEqual(
    groups.filter((group) => group.measureId !== "fibre").map((group) => group.value),
    ["8", "8"],
  );
  assert.throws(() =>
    validateEngineering({
      ...graph,
      objects: graph.objects.map((object) =>
        object.objectId === "A" ? { ...object, quantity: quantity("7999", "REFERENCE") } : object,
      ),
    }),
  );
});
test("structure rejects cycles, multiple parents and mismatched measures while references remain independent", () => {
  const graph = example();
  const edge = {
    relationshipId: "cycle",
    version: 1,
    sourceObjectId: "B1",
    targetObjectId: "A",
    kind: "INCLUDES" as const,
  };
  assert.throws(() => validateEngineering({ ...graph, edges: [...graph.edges, edge] }));
  assert.throws(() =>
    validateEngineering({ ...graph, edges: [...graph.edges, { ...edge, targetObjectId: "B2" }] }),
  );
  validateEngineering({ ...graph, edges: [...graph.edges, { ...edge, kind: "REFERENCE" }] });
  assert.throws(() =>
    validateEngineering({
      ...graph,
      objects: graph.objects.map((object) =>
        object.objectId === "B" ? { ...object, quantity: null } : object,
      ),
    }),
  );
});
test("observed allocation basis includes siblings and relationship versions", () => {
  const graph = example();
  const observed = {
    objects: graph.objects.map(({ objectId, version }) => ({ objectId, version })),
    relationships: graph.edges,
  };
  requireObserved(graph, ["C"], observed);
  assert.throws(() =>
    requireObserved(
      {
        ...graph,
        objects: graph.objects.map((object) =>
          object.objectId === "D" ? { ...object, version: 2 } : object,
        ),
      },
      ["C"],
      observed,
    ),
  );
  assert.throws(() =>
    requireObserved(
      {
        ...graph,
        edges: graph.edges.map((edge) =>
          edge.relationshipId === "A-C" ? { ...edge, version: 2 } : edge,
        ),
      },
      ["C"],
      observed,
    ),
  );
});

test("removed observed edges conflict, including the former allocation parent", () => {
  const graph = example();
  const observed = observeEngineering(graph, ["C"]);
  for (const removed of ["A-C", "A-B"])
    assert.throws(() =>
      requireObserved(
        { ...graph, edges: graph.edges.filter((edge) => edge.relationshipId !== removed) },
        ["C"],
        observed,
      ),
    );
  const independent: EngineeringGraph = {
    ...graph,
    edges: [
      ...graph.edges,
      {
        relationshipId: "support",
        version: 1,
        sourceObjectId: "C",
        targetObjectId: "B1",
        kind: "REFERENCE",
      },
    ],
  };
  requireObserved(independent, ["C"], observed);
  const inclusion: EngineeringGraph = {
    ...graph,
    edges: graph.edges.map((edge) =>
      edge.relationshipId === "B-B1" ? { ...edge, kind: "INCLUDES" } : edge,
    ),
  };
  assert.throws(() =>
    requireObserved(
      { ...inclusion, edges: inclusion.edges.filter((edge) => edge.relationshipId !== "B-B1") },
      ["B1"],
      observeEngineering(inclusion, ["B1"]),
    ),
  );
});

test("observations exclude unrelated repository objects and incoming location users", () => {
  const graph = example();
  const room = { ...object("room", "0"), quantity: null };
  const unrelated = Array.from({ length: 10001 }, (_, index) => ({
    ...object(`other-${index}`, "1"),
    quantity: null,
  }));
  const large: EngineeringGraph = {
    ...graph,
    objects: [...graph.objects, room, ...unrelated],
    edges: [
      ...graph.edges,
      ...unrelated.map((object) => ({
        relationshipId: object.objectId,
        version: 1,
        sourceObjectId: object.objectId,
        targetObjectId: room.objectId,
        kind: "LOCATED_IN" as const,
      })),
    ],
  };
  assert.deepEqual(observeEngineering(large, ["C"]), observeEngineering(graph, ["C"]));
  assert.deepEqual(observeEngineering(large, ["room"]), {
    objects: [{ objectId: "room", version: 1 }],
    relationships: [],
  });
  assert.ok(JSON.stringify(observeEngineering(large, ["C"])).length < 4000);
});
