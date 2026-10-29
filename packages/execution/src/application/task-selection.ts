type Task = {
  id: string;
  parentId: string | null;
  kind: string;
  plannedQuantity: { measureId: string; value: string } | null;
};
type ContentDocument<T extends Task> = {
  nodes: T[];
  measures: Array<{ id: string; unit: string }>;
};
type ContractLine = { content: { node: { id: string; kind: "WORK" | "TASK" } } };
export function eligibleTasks<T extends Task>(
  document: ContentDocument<T>,
  line: ContractLine | undefined,
) {
  if (!line?.content) return [];
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const measureUnits = new Map(document.measures.map((measure) => [measure.id, measure.unit]));
  return document.nodes
    .filter((node) => {
      if (node.kind !== "TASK" || node.plannedQuantity === null) return false;
      if (line.content?.node.kind === "TASK") return node.id === line.content.node.id;
      for (let current: Task | undefined = node; current?.parentId; ) {
        if (current.parentId === line.content?.node.id) return true;
        current = byId.get(current.parentId);
      }
      return false;
    })
    .map((node) => {
      const measureUnit = node.plannedQuantity
        ? measureUnits.get(node.plannedQuantity.measureId)
        : undefined;
      return { ...node, ...(measureUnit ? { measureUnit } : {}) };
    });
}
export function planTasks<T extends Task>(document: ContentDocument<T>) {
  const measureUnits = new Map(document.measures.map((measure) => [measure.id, measure.unit]));
  return document.nodes
    .filter((node) => node.kind === "TASK")
    .map((node) => {
      const measureUnit = node.plannedQuantity
        ? measureUnits.get(node.plannedQuantity.measureId)
        : undefined;
      return { ...node, ...(measureUnit ? { measureUnit } : {}) };
    });
}
