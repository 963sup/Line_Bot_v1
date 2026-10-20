"use client";

import type { ObjectTreeDto, StructureNodeDto } from "@line_bot_v1/resources/contracts/dto/objects";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { mergeEngineeringObservations, objectTree } from "./engineering-response";
import { appendCursorPage } from "./object-pagination";
import styles from "./object-panel.module.css";
import type { ObjectCommand, ObjectFamily } from "./object-pending";
import { type ObjectTypeView, objectScope } from "./object-response";

type TreeProps = {
  page: ObjectTreeDto;
  basePath: string;
  scope: ReturnType<typeof objectScope>;
  types: readonly ObjectTypeView[];
  busy: boolean;
  refresh: number;
  includeArchived: boolean;
  request(family: ObjectFamily, query?: Record<string, string>): Promise<unknown>;
  mutate(
    family: ObjectFamily,
    factory: (scope: ReturnType<typeof objectScope>) => ObjectCommand,
  ): Promise<void>;
  invalidate(): void;
};

function ChildForm({
  parent,
  types,
  disabled,
  submit,
  cancel,
}: {
  parent: StructureNodeDto;
  types: readonly ObjectTypeView[];
  disabled: boolean;
  submit(form: FormData): void;
  cancel(): void;
}) {
  const id = useId();
  const enabled = types.filter((type) => type.enabled);
  return (
    <form
      className={`${styles.form} ${styles.childForm}`}
      aria-label={`新增 ${parent.name} 的子 Object`}
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <fieldset disabled={disabled}>
        <legend>新增子 Object</legend>
        <label htmlFor={`${id}-name`}>名稱</label>
        <input id={`${id}-name`} name="name" required maxLength={200} autoFocus />
        <label htmlFor={`${id}-type`}>Object Type</label>
        <select
          id={`${id}-type`}
          name="typeId"
          required
          defaultValue={
            enabled.some((type) => type.id === parent.typeId)
              ? parent.typeId
              : (enabled[0]?.id ?? "")
          }
        >
          <option value="">選擇 Type</option>
          {enabled.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-content`}>內容</label>
        <textarea id={`${id}-content`} name="content" maxLength={262144} rows={3} />
        <div className={styles.actions}>
          <button type="submit">建立子 Object</button>
          <button type="button" className="secondary" onClick={cancel}>
            取消
          </button>
        </div>
      </fieldset>
    </form>
  );
}

type BranchProps = Omit<TreeProps, "page"> & {
  parentId: string | null;
  initialPage?: ObjectTreeDto;
  snapshots: Map<string | null, { refresh: number; page: ObjectTreeDto }>;
};

function ObjectBranch({ parentId, initialPage, snapshots, ...props }: BranchProps) {
  const { basePath, scope, types, busy, refresh, includeArchived, request, mutate, invalidate } =
    props;
  const [data, setData] = useState<ObjectTreeDto | null>(() => {
    const cached = snapshots.get(parentId);
    return initialPage ?? (cached?.refresh === refresh ? cached.page : null);
  });
  const dataRef = useRef(data);
  dataRef.current = data;
  const previousRefresh = useRef(refresh);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [creating, setCreating] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const groupId = useId();
  const actorUserId = scope.actorUserId;
  const repositoryId = scope.repository.id;
  const read = useCallback(
    async (after?: string) => {
      const ticket = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const value = await request("objects", {
          view: "tree",
          includeArchived: String(includeArchived),
          ...(parentId ? { parentId } : {}),
          ...(after ? { after } : {}),
        });
        if (ticket !== generation.current) return;
        const fresh = objectScope(value);
        if (fresh.actorUserId !== actorUserId || fresh.repository.id !== repositoryId) {
          invalidate();
          return;
        }
        const next = objectTree(value);
        if ((next.parent?.objectId ?? null) !== parentId)
          throw new Error("Object 父層回應不一致，請重新讀取。");
        const current = dataRef.current;
        const snapshot =
          after && current
            ? {
                ...next,
                nodes: {
                  items: appendCursorPage(
                    current.nodes.items,
                    next.nodes.items,
                    (node) => node.objectId,
                  ),
                  next: next.nodes.next,
                },
                observed: mergeEngineeringObservations(current.observed, next.observed),
              }
            : next;
        snapshots.delete(parentId);
        snapshots.set(parentId, { refresh, page: snapshot });
        if (snapshots.size > 32) {
          const oldest = snapshots.keys().next().value;
          if (oldest !== undefined) snapshots.delete(oldest);
        }
        setData(snapshot);
      } catch (cause) {
        if (ticket !== generation.current) return;
        snapshots.delete(parentId);
        setData(null);
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          [401, 403].includes(Number(cause.status))
        )
          invalidate();
        else setError(cause instanceof Error ? cause.message : "無法讀取此層 Objects。");
      } finally {
        if (ticket === generation.current) setLoading(false);
      }
    },
    [request, parentId, includeArchived, actorUserId, repositoryId, invalidate, refresh, snapshots],
  );

  useEffect(() => {
    if (previousRefresh.current !== refresh) {
      previousRefresh.current = refresh;
      setCreating(null);
    }
    if (initialPage) {
      generation.current++;
      setData(initialPage);
      setError("");
      setLoading(false);
    } else {
      const cached = snapshots.get(parentId);
      if (cached?.refresh === refresh) {
        snapshots.delete(parentId);
        snapshots.set(parentId, cached);
        setData(cached.page);
        setError("");
        setLoading(false);
      } else void read();
    }
    return () => {
      generation.current++;
    };
  }, [initialPage, refresh, read, snapshots, parentId]);

  return (
    <div aria-busy={loading}>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" disabled={loading || busy} onClick={() => void read()}>
            重試此層
          </button>
        </p>
      ) : null}
      {loading ? <p role="status">正在讀取此層 Objects…</p> : null}
      {data ? (
        <>
          {data.nodes.items.length ? (
            <ul className={styles.treeList}>
              {data.nodes.items.map((node) => {
                const open = expanded.has(node.objectId);
                const childId = `${groupId}-${node.objectId}`;
                return (
                  <li key={node.objectId}>
                    <div className={styles.treeRow}>
                      {node.hasChildren ? (
                        <button
                          type="button"
                          className={styles.treeToggle}
                          aria-label={`${open ? "收合" : "展開"} ${node.name}`}
                          aria-expanded={open}
                          aria-controls={childId}
                          disabled={busy}
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (open) next.delete(node.objectId);
                              else next.add(node.objectId);
                              return next;
                            })
                          }
                        >
                          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                        </button>
                      ) : (
                        <span className={styles.treeSpacer} />
                      )}
                      <div className={styles.treeLabel}>
                        <Link href={`${basePath}/${encodeURIComponent(node.objectId)}`}>
                          {node.name}
                        </Link>
                        <span className={styles.muted}>
                          {node.typeName}
                          {node.archived ? " · 已封存" : ""}
                        </span>
                      </div>
                      {scope.canEdit && !node.archived ? (
                        <button
                          type="button"
                          className={styles.treeAdd}
                          aria-label={`新增 ${node.name} 的子 Object`}
                          aria-expanded={creating === node.objectId}
                          aria-controls={`${childId}-form`}
                          disabled={busy || loading}
                          onClick={() =>
                            setCreating(creating === node.objectId ? null : node.objectId)
                          }
                        >
                          <span aria-hidden="true">＋</span>
                        </button>
                      ) : null}
                    </div>
                    {creating === node.objectId ? (
                      <div id={`${childId}-form`}>
                        <ChildForm
                          parent={node}
                          types={types}
                          disabled={busy || loading}
                          cancel={() => setCreating(null)}
                          submit={(form) =>
                            void mutate("objects", (fresh) => ({
                              action: "create-child",
                              expectedVersion: 0,
                              repositoryId: fresh.repository.id,
                              requestId: crypto.randomUUID(),
                              objectId: crypto.randomUUID(),
                              relationshipId: crypto.randomUUID(),
                              parentObjectId: node.objectId,
                              name: String(form.get("name")),
                              typeId: String(form.get("typeId")),
                              content: String(form.get("content") ?? ""),
                              kind: "INCLUDES",
                              quantity: null,
                              observed: data.observed,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    <div id={childId} hidden={!open} className={styles.treeChildren}>
                      {open ? (
                        <ObjectBranch {...props} snapshots={snapshots} parentId={node.objectId} />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>{parentId ? "尚無子 Object。" : "尚無 Object。"}</p>
          )}
          {data.nodes.next ? (
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void read(data.nodes.next ?? undefined)}
            >
              {parentId ? "載入更多子 Objects" : "載入更多 Objects"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function ObjectTree({ page, ...props }: TreeProps) {
  const snapshots = useRef(new Map<string | null, { refresh: number; page: ObjectTreeDto }>());
  return (
    <ObjectBranch {...props} snapshots={snapshots.current} parentId={null} initialPage={page} />
  );
}
