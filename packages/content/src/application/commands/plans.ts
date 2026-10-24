import { isRecord } from "@line_bot_v1/platform/validation";
import { ContentError } from "../../domain/error.js";
import {
  type ContentMeasure,
  type ContentNodeKind,
  type ContentPlanDocument,
  type ContentPlanNode,
  type ContentResourceKind,
  type ContentResourcePin,
} from "../../domain/plan.js";
import { normalizeQuantityUnit } from "../../domain/quantity.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type ContentPlanCommand =
  | Readonly<{
      action: "initialize" | "replace";
      repositoryId: string;
      requestId: string;
      expectedVersion: number;
      document: ContentPlanDocument;
    }>
  | Readonly<{
      action: "import-contract-document";
      repositoryId: string;
      requestId: string;
      expectedVersion: number;
      confirmedDisclosure: true;
      contract: Readonly<{ documentId: string; revisionId: string }>;
    }>;

function invalid(message = "Invalid Content plan command."): never {
  throw new ContentError(400, message, "INVALID_INPUT");
}

function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return invalid();
  return { ...value };
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid("Unknown Content plan field.");
}

function id(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) return invalid();
  return value.toLowerCase();
}

function text(value: unknown): string {
  if (typeof value !== "string") return invalid();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return invalid();
  return value;
}

function nodeKind(value: unknown): ContentNodeKind {
  if (
    value !== "SUBJECT" &&
    value !== "OBJECT" &&
    value !== "SUBOBJECT" &&
    value !== "WORK" &&
    value !== "TASK"
  )
    return invalid();
  return value;
}

function resourceKind(value: unknown): ContentResourceKind {
  if (value !== "LOCATION" && value !== "EQUIPMENT" && value !== "MATERIAL") return invalid();
  return value;
}

function measure(input: unknown): ContentMeasure {
  const value = object(input);
  exact(value, ["id", "name", "subject", "unit"]);
  return {
    id: id(value.id),
    name: text(value.name),
    subject: text(value.subject),
    unit: normalizeQuantityUnit(value.unit),
  };
}

function node(input: unknown): ContentPlanNode {
  const value = object(input);
  exact(value, ["id", "parentId", "position", "kind", "title", "body", "plannedQuantity"]);
  const kind = nodeKind(value.kind);
  const position = integer(value.position);
  if (position < 0) return invalid();
  let plannedQuantity: ContentPlanNode["plannedQuantity"] = null;
  if (value.plannedQuantity !== null) {
    const quantity = object(value.plannedQuantity);
    exact(quantity, ["measureId", "value"]);
    const quantityValue = text(quantity.value);
    if (quantityValue.length > 32) return invalid();
    plannedQuantity = { measureId: id(quantity.measureId), value: quantityValue };
  }
  return {
    id: id(value.id),
    parentId: value.parentId === null ? null : id(value.parentId),
    position,
    kind,
    title: text(value.title),
    body: text(value.body),
    plannedQuantity,
  };
}

function pin(input: unknown): ContentResourcePin {
  const value = object(input);
  exact(value, ["nodeId", "resourceId", "resourceRevisionId", "kind"]);
  const kind = resourceKind(value.kind);
  return {
    nodeId: id(value.nodeId),
    resourceId: id(value.resourceId),
    resourceRevisionId: id(value.resourceRevisionId),
    kind,
  };
}

function document(input: unknown): ContentPlanDocument {
  const value = object(input);
  exact(value, ["schemaVersion", "measures", "nodes", "resourcePins"]);
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.measures) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.resourcePins) ||
    value.measures.length > 1000 ||
    value.nodes.length > 1000 ||
    value.resourcePins.length > 5000
  )
    return invalid();
  return {
    schemaVersion: 1,
    measures: value.measures.map(measure),
    nodes: value.nodes.map(node),
    resourcePins: value.resourcePins.map(pin),
  };
}

export function parseContentPlanCommand(input: unknown): ContentPlanCommand {
  const value = object(input);
  const expectedVersion = integer(value.expectedVersion);
  if (
    typeof value.repositoryId !== "string" ||
    value.repositoryId.length < 1 ||
    value.repositoryId.length > 128 ||
    expectedVersion < 0 ||
    expectedVersion >= 2_147_483_647
  )
    return invalid();
  const repositoryId = value.repositoryId;
  const requestId = id(value.requestId);
  if (value.action === "import-contract-document") {
    exact(value, [
      "action",
      "repositoryId",
      "requestId",
      "expectedVersion",
      "confirmedDisclosure",
      "contract",
    ]);
    if (expectedVersion === 0 || value.confirmedDisclosure !== true)
      return invalid("Explicit whole-document Content disclosure is required.");
    const contract = object(value.contract);
    exact(contract, ["documentId", "revisionId"]);
    return {
      action: "import-contract-document",
      repositoryId,
      requestId,
      expectedVersion,
      confirmedDisclosure: true,
      contract: { documentId: id(contract.documentId), revisionId: id(contract.revisionId) },
    };
  }
  exact(value, ["action", "repositoryId", "requestId", "expectedVersion", "document"]);
  if (value.action !== "initialize" && value.action !== "replace") return invalid();
  return {
    action: value.action,
    repositoryId,
    requestId,
    expectedVersion,
    document: document(value.document),
  };
}
