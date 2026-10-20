"use client";

import type {
  ObjectMeasureDto,
  Quantity,
  StructureDto,
} from "@line_bot_v1/resources/contracts/dto/objects";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { mergeEngineeringObservations, structureView } from "./engineering-response";
import { appendCursorPage } from "./object-pagination";
import styles from "./object-panel.module.css";
import type { ObjectCommand, ObjectFamily } from "./object-pending";
import { type ObjectTypeView, objectScope, objects } from "./object-response";

function quantityInput(form: FormData): Quantity | null {
  const value = String(form.get("value") ?? "");
  if (value === "") return null;
  const sourceObjectId = String(form.get("sourceObjectId") ?? "").trim();
  const sourceRevisionId = String(form.get("sourceRevisionId") ?? "").trim();
  return {
    measureId: String(form.get("measureId") ?? ""),
    value,
    purpose: form.get("purpose") === "REFERENCE" ? "REFERENCE" : "PLANNED",
    sourceReference:
      sourceObjectId || sourceRevisionId
        ? { objectId: sourceObjectId, revisionId: sourceRevisionId }
        : null,
  };
}
function QuantityFields({
  quantity,
  measures,
}: {
  quantity: Quantity | null;
  measures: readonly ObjectMeasureDto[];
}) {
  const fieldId = useId();
  return (
    <>
      <label htmlFor={`${fieldId}-measure`}>計量定義</label>
      <select id={`${fieldId}-measure`} name="measureId" defaultValue={quantity?.measureId ?? ""}>
        <option value="">選擇計量對象與方法</option>
        {measures.map((measure) => (
          <option key={measure.id} value={measure.id}>
            {measure.name} · {measure.unit} · {measure.subject}
          </option>
        ))}
      </select>
      <label>
        數量（留空表示未登錄）
        <input
          name="value"
          inputMode="decimal"
          defaultValue={quantity?.value ?? ""}
          autoComplete="off"
        />
      </label>
      <label htmlFor={`${fieldId}-purpose`}>數量用途</label>
      <select
        id={`${fieldId}-purpose`}
        name="purpose"
        defaultValue={quantity?.purpose ?? "PLANNED"}
      >
        <option value="REFERENCE">參考／合約計價基準</option>
        <option value="PLANNED">計畫數量</option>
      </select>
      <details>
        <summary>固定來源（選填）</summary>
        <p>記錄來源不代表已核定或具法律效力。</p>
        <label>
          來源 Object ID
          <input name="sourceObjectId" defaultValue={quantity?.sourceReference?.objectId ?? ""} />
        </label>
        <label>
          來源 Revision ID
          <input
            name="sourceRevisionId"
            defaultValue={quantity?.sourceReference?.revisionId ?? ""}
          />
        </label>
      </details>
    </>
  );
}

export default function EngineeringPanel({
  rootId,
  basePath,
  scope,
  types,
  busy,
  refresh,
  request,
  mutate,
  invalidate,
}: {
  rootId: string;
  basePath: string;
  scope: ReturnType<typeof objectScope>;
  types: readonly ObjectTypeView[];
  busy: boolean;
  refresh: number;
  request(family: ObjectFamily, query?: Record<string, string>): Promise<unknown>;
  mutate(
    family: ObjectFamily,
    factory: (scope: ReturnType<typeof objectScope>) => ObjectCommand | Promise<ObjectCommand>,
  ): Promise<void>;
  invalidate(): void;
}) {
  const fieldId = useId();
  const [parentId, setParentId] = useState(rootId);
  const [trail, setTrail] = useState<readonly { id: string; name: string }[]>([]);
  const [groupBy, setGroupBy] = useState<"tree" | "location" | "type">("tree");
  const [data, setData] = useState<StructureDto | null>(null);
  const dataRef = useRef<StructureDto | null>(null);
  dataRef.current = data;
  const [options, setOptions] = useState<ReturnType<typeof objects>["objects"]>([]);
  const [optionsNext, setOptionsNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const scopeActor = scope.actorUserId;
  const repositoryId = scope.repository.id;
  const read = useCallback(
    async (after?: string) => {
      const ticket = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const value = await request("objects", {
          view: "structure",
          rootId,
          parentId,
          groupBy: groupBy === "type" ? "type" : "location",
          ...(after ? { after } : {}),
        });
        if (ticket !== generation.current) return;
        const fresh = objectScope(value);
        if (fresh.actorUserId !== scopeActor || fresh.repository.id !== repositoryId) {
          invalidate();
          return;
        }
        const next = structureView(value);
        const current = dataRef.current;
        setData(
          after && current?.parentId === next.parentId
            ? {
                ...next,
                observed: mergeEngineeringObservations(current.observed, next.observed),
                nodes: {
                  ...next.nodes,
                  items: appendCursorPage(
                    current.nodes.items,
                    next.nodes.items,
                    (node) => node.objectId,
                  ),
                },
              }
            : next,
        );
      } catch (cause) {
        if (ticket !== generation.current) return;
        setData(null);
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          Number(cause.status) === 404 &&
          parentId !== rootId &&
          "code" in cause &&
          cause.code === "STRUCTURE_SCOPE_CHANGED"
        ) {
          setTrail([]);
          setParentId(rootId);
          return;
        }
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          [401, 403, 404].includes(Number(cause.status))
        )
          invalidate();
        setError(cause instanceof Error ? cause.message : "工程讀取失敗。");
      } finally {
        if (ticket === generation.current) setLoading(false);
      }
    },
    [request, rootId, parentId, groupBy, scopeActor, repositoryId, invalidate],
  );
  useEffect(() => {
    void refresh;
    void read();
    return () => {
      generation.current++;
    };
  }, [read, refresh]);

  async function loadOptions(after?: string) {
    const ticket = generation.current;
    setLoading(true);
    setError("");
    try {
      const value = await request("objects", { view: "list", ...(after ? { after } : {}) });
      if (ticket !== generation.current) return;
      const fresh = objectScope(value);
      if (fresh.actorUserId !== scopeActor || fresh.repository.id !== repositoryId) {
        invalidate();
        return;
      }
      const page = objects(value);
      setOptions((current) =>
        after ? appendCursorPage(current, page.objects, (object) => object.objectId) : page.objects,
      );
      setOptionsNext(page.next);
      await read();
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "Object 讀取失敗。");
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          [401, 403, 404].includes(Number(cause.status))
        )
          invalidate();
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  const view = data?.parentId === parentId ? data : null;
  const disabled = busy || loading || scope.archived;
  const measure = (id: string) => view?.measures.find((measure) => measure.id === id);
  function navigate(id: string, name: string) {
    setTrail((trail) => [...trail, { id: parentId, name }]);
    setParentId(id);
  }
  function send(
    family: ObjectFamily,
    command: Record<string, unknown> & {
      action: string;
      expectedVersion: number;
      observed?: StructureDto["observed"];
    },
  ) {
    void mutate(family, async (fresh) => {
      let observed = command.observed;
      if (
        family === "relationships" &&
        (command.action === "set-parent" || command.action === "set-location") &&
        typeof command.targetObjectId === "string"
      ) {
        const value = await request("objects", {
          view: "structure",
          rootId: command.targetObjectId,
        });
        const targetScope = objectScope(value);
        if (
          targetScope.actorUserId !== fresh.actorUserId ||
          targetScope.repository.id !== fresh.repository.id
        )
          throw Object.assign(new Error("登入狀態已改變。"), { status: 403 });
        const target = structureView(value);
        if (!observed) throw new Error("工程觀察版本不存在。");
        observed = mergeEngineeringObservations(observed, target.observed);
      }
      return {
        ...command,
        ...(observed ? { observed } : {}),
        repositoryId: fresh.repository.id,
        requestId: crypto.randomUUID(),
      };
    });
  }
  return (
    <section className={styles.panel} data-testid="object-engineering" aria-busy={loading}>
      <h2>工程範圍與計量</h2>
      <div className={styles.actions}>
        {(
          [
            ["tree", "工程結構"],
            ["location", "依位置"],
            ["type", "依工種"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={groupBy === key}
            disabled={loading}
            onClick={() => setGroupBy(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" disabled={loading} onClick={() => void read()}>
            重新讀取工程
          </button>
        </p>
      ) : null}
      {!view && !error ? <p role="status">正在讀取工程…</p> : null}
      {view ? (
        <>
          <p>
            <strong>{view.node.name}</strong>
            {view.node.archived ? " · 已封存（仍占分配量）" : ""}
          </p>
          {view.basis ? (
            <p data-testid="engineering-balance">
              {view.basis.purpose === "REFERENCE" ? "參考基準" : "計畫數量"} {view.basis.value}{" "}
              {measure(view.basis.measureId)?.unit} · 已分配 {view.allocated} · 未分配{" "}
              {view.remaining}
              <br />
              {view.basis.sourceReference
                ? `來源 ${view.basis.sourceReference.objectId} / ${view.basis.sourceReference.revisionId}`
                : "來源未登錄"}
            </p>
          ) : (
            <p>數量未登錄</p>
          )}
          {groupBy === "tree" ? (
            <>
              {trail.length ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const previous = trail.at(-1);
                    if (previous) {
                      setParentId(previous.id);
                      setTrail(trail.slice(0, -1));
                    }
                  }}
                >
                  返回上一層
                </button>
              ) : null}
              {view.nodes.items.length ? (
                <ul className={styles.list}>
                  {view.nodes.items.map((node) => (
                    <li key={node.objectId}>
                      <Link href={`${basePath}/${node.objectId}`}>{node.name}</Link> ·{" "}
                      {node.relationship?.kind === "ALLOCATES" ? "範圍分配" : "配套工項"} ·{" "}
                      {node.quantity
                        ? `${node.quantity.value} ${measure(node.quantity.measureId)?.unit ?? ""}`
                        : "數量未登錄"}
                      {node.archived ? " · 已封存" : ""}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => navigate(node.objectId, view.node.name)}
                      >
                        {node.hasChildren ? "展開子範圍" : "管理此範圍"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>尚無子範圍。</p>
              )}
              {view.nodes.next ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void read(view.nodes.next ?? undefined)}
                >
                  載入更多子範圍
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p>全工程範圍彙總，保留未指定位置與尚未細分的餘量。參考基準與計畫數量分開列示。</p>
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{groupBy === "location" ? "位置" : "工種"}</th>
                      <th scope="col">計量對象</th>
                      <th scope="col">用途</th>
                      <th scope="col">數量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.groups.map((group) => (
                      <tr key={`${group.key}:${group.measureId}:${group.purpose}`}>
                        <td>{group.name}</td>
                        <td>{measure(group.measureId)?.name}</td>
                        <td>{group.purpose === "REFERENCE" ? "參考餘量" : "計畫"}</td>
                        <td>
                          {group.value} {measure(group.measureId)?.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {scope.canEdit ? (
            <details>
              <summary>調整計量與工程結構</summary>
              <form
                key={`quantity:${view.node.revisionId}`}
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  send("objects", {
                    action: "set-quantities",
                    expectedVersion: 0,
                    observed: view.observed,
                    changes: [
                      {
                        objectId: view.node.objectId,
                        expectedVersion: view.node.version,
                        quantity: quantityInput(form),
                      },
                    ],
                  });
                }}
              >
                <h3>本範圍數量</h3>
                <fieldset disabled={disabled || view.node.archived}>
                  <QuantityFields quantity={view.node.quantity} measures={view.measures} />
                  <button type="submit">儲存數量</button>
                </fieldset>
              </form>
              <form
                key={`batch:${view.nodes.items.map((node) => node.revisionId).join()}`}
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const changes = view.nodes.items.flatMap((node) => {
                    const value = form.get(node.objectId);
                    return !node.archived &&
                      node.quantity &&
                      typeof value === "string" &&
                      value !== node.quantity.value
                      ? [
                          {
                            objectId: node.objectId,
                            expectedVersion: node.version,
                            quantity: value === "" ? null : { ...node.quantity, value },
                          },
                        ]
                      : [];
                  });
                  if (changes.length)
                    send("objects", {
                      action: "set-quantities",
                      expectedVersion: 0,
                      observed: view.observed,
                      changes,
                    });
                }}
              >
                <h3>批次調整本頁子範圍</h3>
                <p>整批驗證分配上限並同時儲存；清空數量前須先解除相關分配。</p>
                <fieldset disabled={disabled}>
                  {view.nodes.items
                    .filter((node) => node.quantity && !node.archived)
                    .map((node) => (
                      <label key={node.objectId}>
                        {node.name}（{measure(node.quantity?.measureId ?? "")?.unit}）
                        <input
                          name={node.objectId}
                          inputMode="decimal"
                          defaultValue={node.quantity?.value}
                        />
                      </label>
                    ))}
                  <button type="submit">儲存批次數量</button>
                </fieldset>
              </form>
              <form
                key={`child:${parentId}`}
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  send("objects", {
                    action: "create-child",
                    expectedVersion: 0,
                    objectId: crypto.randomUUID(),
                    relationshipId: crypto.randomUUID(),
                    parentObjectId: parentId,
                    observed: view.observed,
                    name: String(form.get("name")),
                    typeId: String(form.get("typeId")),
                    content: String(form.get("content") ?? ""),
                    kind: String(form.get("kind")),
                    quantity: quantityInput(form),
                  });
                }}
              >
                <h3>新增子 Object</h3>
                <fieldset disabled={disabled || view.node.archived}>
                  <label>
                    名稱
                    <input name="name" required maxLength={200} />
                  </label>
                  <label htmlFor={`${fieldId}-type`}>工種</label>
                  <select
                    id={`${fieldId}-type`}
                    name="typeId"
                    required
                    defaultValue={view.node.typeId}
                  >
                    {types
                      .filter((type) => type.enabled)
                      .map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                  </select>
                  <label htmlFor={`${fieldId}-child-kind`}>結構關係</label>
                  <select id={`${fieldId}-child-kind`} name="kind">
                    <option value="ALLOCATES">範圍分配（占用父數量）</option>
                    <option value="INCLUDES">配套工項（獨立計量）</option>
                  </select>
                  <QuantityFields
                    quantity={
                      view.basis
                        ? { ...view.basis, value: "", purpose: "PLANNED", sourceReference: null }
                        : null
                    }
                    measures={view.measures}
                  />
                  <label>
                    內容
                    <textarea name="content" maxLength={262144} />
                  </label>
                  <button type="submit">建立子 Object</button>
                </fieldset>
              </form>
              <h3>父範圍與位置</h3>
              <p>
                父範圍：{view.parentObjectId ?? "未指定"} · 直接位置：
                {view.location?.name ?? "未指定位置"}
              </p>
              <button type="button" disabled={disabled} onClick={() => void loadOptions()}>
                載入可選 Object
              </button>
              {optionsNext ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void loadOptions(optionsNext ?? undefined)}
                >
                  更多可選 Object
                </button>
              ) : null}
              <form
                key={`links:${view.node.objectId}:${view.node.relationship?.relationshipId}:${view.location?.relationshipId}`}
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const action =
                    form.get("action") === "set-parent" ? "set-parent" : "set-location";
                  send("relationships", {
                    action,
                    expectedVersion: view.node.version,
                    objectId: view.node.objectId,
                    targetObjectId: String(form.get("targetObjectId")) || null,
                    relationshipId: crypto.randomUUID(),
                    previousRelationshipId:
                      action === "set-parent"
                        ? (view.node.relationship?.relationshipId ?? null)
                        : (view.location?.relationshipId ?? null),
                    kind: action === "set-parent" ? String(form.get("kind")) : "LOCATED_IN",
                    observed: view.observed,
                  });
                }}
              >
                <fieldset disabled={disabled}>
                  <label htmlFor={`${fieldId}-action`}>操作</label>
                  <select id={`${fieldId}-action`} name="action">
                    <option value="set-parent">移動／解除父範圍</option>
                    <option value="set-location">設定／解除直接位置</option>
                  </select>
                  <label htmlFor={`${fieldId}-target`}>目標 Object</label>
                  <select id={`${fieldId}-target`} name="targetObjectId">
                    <option value="">解除目前關係</option>
                    {options
                      .filter((object) => object.objectId !== parentId)
                      .map((object) => (
                        <option key={object.objectId} value={object.objectId}>
                          {object.name} · {object.typeName}
                        </option>
                      ))}
                  </select>
                  <label htmlFor={`${fieldId}-parent-kind`}>父關係</label>
                  <select
                    id={`${fieldId}-parent-kind`}
                    name="kind"
                    defaultValue={view.node.relationship?.kind ?? "ALLOCATES"}
                  >
                    <option value="ALLOCATES">範圍分配</option>
                    <option value="INCLUDES">配套工項</option>
                  </select>
                  <button type="submit">更新工程關係</button>
                </fieldset>
              </form>
            </details>
          ) : null}
          {scope.canManageTypes ? (
            <details>
              <summary>新增計量定義</summary>
              <p>定義建立後不可修改；計量對象或方法修正時請建立新定義。</p>
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  send("measures", {
                    action: "create-measure",
                    expectedVersion: 0,
                    measureId: crypto.randomUUID(),
                    name: String(form.get("name")),
                    subject: String(form.get("subject")),
                    unit: String(form.get("unit")),
                  });
                }}
              >
                <fieldset disabled={disabled}>
                  <label>
                    名稱
                    <input name="name" required maxLength={100} />
                  </label>
                  <label>
                    計量對象與方法
                    <textarea name="subject" required maxLength={2000} />
                  </label>
                  <label htmlFor={`${fieldId}-unit`}>單位</label>
                  <select id={`${fieldId}-unit`} name="unit">
                    <option value="m">m</option>
                    <option value="pcs">pcs</option>
                  </select>
                  <button type="submit">建立計量定義</button>
                </fieldset>
              </form>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
