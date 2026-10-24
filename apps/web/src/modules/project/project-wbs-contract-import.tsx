"use client";

import type { ProjectWbsContractImport } from "@line_bot_v1/wbs/contracts/dto/project-content";
import type { WbsNode } from "@line_bot_v1/wbs/domain/document";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import styles from "./project-wbs-panel.module.css";

type ContractLine = Readonly<{
  lineId: string;
  title: string;
  agreedQuantity: string;
  unit: string;
}>;
type ContractSource = Readonly<{
  repositoryId: string;
  contractId: string;
  revisionId: string;
  lines: readonly ContractLine[];
}>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Contract 來源回應格式不正確。");
  return Object.fromEntries(Object.entries(value));
}
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function reviewedContractSource(value: unknown, contractId: string): ContractSource {
  const response = record(value);
  const repository = record(response.repository);
  const revision = record(response.revision);
  if (
    typeof repository.id !== "string" ||
    revision.repositoryId !== repository.id ||
    revision.contractId !== contractId ||
    revision.state !== "ACTIVE" ||
    typeof revision.revisionId !== "string" ||
    !uuid.test(revision.revisionId) ||
    !Array.isArray(revision.lines) ||
    revision.lines.length === 0 ||
    revision.lines.length > 100
  )
    throw new Error("只能從目前 ACTIVE 的精確 Contract 版本選擇來源。");
  const lines = revision.lines.map((raw): ContractLine => {
    const line = record(raw);
    const content = record(line.content);
    const node = record(content.node);
    const planned = record(node.plannedQuantity);
    const measure = record(planned.measure);
    if (
      typeof line.lineId !== "string" ||
      !uuid.test(line.lineId) ||
      typeof line.agreedQuantity !== "string" ||
      (node.kind !== "WORK" && node.kind !== "TASK") ||
      typeof node.title !== "string" ||
      typeof measure.unit !== "string"
    )
      throw new Error("Contract 項次缺少有效的 Content Work／Task 證據。");
    return {
      lineId: line.lineId,
      title: node.title,
      agreedQuantity: line.agreedQuantity,
      unit: measure.unit,
    };
  });
  return {
    repositoryId: repository.id,
    contractId,
    revisionId: revision.revisionId,
    lines,
  };
}

export default function ProjectWbsContractImport({
  liffId,
  projectId,
  nodes,
  disabled,
  onImport,
}: {
  liffId: string;
  projectId: string;
  nodes: readonly WbsNode[];
  disabled: boolean;
  onImport(command: ProjectWbsContractImport): Promise<void>;
}) {
  const [owner, setOwner] = useState("");
  const [repository, setRepository] = useState("");
  const [contractId, setContractId] = useState("");
  const [expectedRevision, setExpectedRevision] = useState("");
  const [source, setSource] = useState<ContractSource | null>(null);
  const [lineId, setLineId] = useState("");
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setOwner(query.get("contractOwner") ?? "");
    setRepository(query.get("contractRepository") ?? "");
    const contract = query.get("contractId") ?? "";
    const revision = query.get("contractRevisionId") ?? "";
    setContractId(uuid.test(contract) ? contract : "");
    setExpectedRevision(uuid.test(revision) ? revision : "");
    const clear = () => {
      epoch.current++;
      setSource(null);
      setLineId("");
      setAcknowledged(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clear();
    };
    const unsubscribe = liffClient.onSessionBlocked(clear);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clear);
    return () => {
      epoch.current++;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clear);
    };
  }, []);

  function resetSelection() {
    epoch.current++;
    setSource(null);
    setLineId("");
    setAcknowledged(false);
    setError("");
  }

  async function loadContract() {
    if (!owner.trim() || !repository.trim() || !uuid.test(contractId) || disabled || busy) return;
    const ticket = ++epoch.current;
    setBusy(true);
    setError("");
    setSource(null);
    setLineId("");
    setAcknowledged(false);
    try {
      const generation = await liffClient.ensureSession(liffId);
      if (!generation) throw new Error("請先完成 LINE 登入。");
      const query = new URLSearchParams({
        owner: owner.trim(),
        name: repository.trim(),
        contractId,
        ...(expectedRevision ? { revisionId: expectedRevision } : {}),
      });
      const response = await fetch(`/api/repository-contracts?${query.toString()}`, {
        cache: "no-store",
        headers: { "X-App-Session-Generation": generation },
      });
      const payload: unknown = await response.json();
      if (ticket !== epoch.current) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          epoch.current++;
          setSource(null);
          setLineId("");
          setAcknowledged(false);
          setError("Contract 授權已失效，不能繼續。");
          return;
        }
        throw new Error("Contract 來源無法讀取或不符合條件。");
      }
      const resolved = reviewedContractSource(payload, contractId);
      if (expectedRevision && resolved.revisionId !== expectedRevision)
        throw new Error("Contract 版本不符合交接時選取的版本。");
      setSource(resolved);
    } catch (cause) {
      if (ticket !== epoch.current) return;
      setError(cause instanceof Error ? cause.message : "無法讀取 Contract。");
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }

  const line = source?.lines.find((item) => item.lineId === lineId);
  const allowed =
    !disabled &&
    !busy &&
    !!source &&
    !!line &&
    !!title.trim() &&
    !!deliverable.trim() &&
    !!acceptanceCriteria.trim() &&
    acknowledged;

  return (
    <section className={styles.panel} aria-label="從 Contract 建立 WBS Work Package">
      <h2>從已確認的 Contract 項次建立 Work Package</h2>
      <p>
        目標 Project：{projectId}。請選擇有權存取的 Repository 與 ACTIVE Contract。
        合約項次不會自動轉換為 WBS 數量或 Baseline。
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <label>
          Repository 擁有者
          <input
            value={owner}
            disabled={disabled || busy}
            onChange={(e) => {
              resetSelection();
              setOwner(e.target.value);
            }}
          />
        </label>
        <label>
          Repository 名稱
          <input
            value={repository}
            disabled={disabled || busy}
            onChange={(e) => {
              resetSelection();
              setRepository(e.target.value);
            }}
          />
        </label>
        <label>
          Contract ID
          <input
            value={contractId}
            disabled={disabled || busy}
            onChange={(e) => {
              resetSelection();
              setContractId(e.target.value);
              setExpectedRevision("");
            }}
          />
        </label>
        <button disabled={disabled || busy || !uuid.test(contractId)} onClick={() => void loadContract()}>
          讀取 ACTIVE Contract
        </button>
      </div>
      {source && (
        <>
          <p>來源版本：{source.revisionId}（讀取時已重新授權）</p>
          <label>
            選擇 Contract 項次
            <select
              value={lineId}
              disabled={disabled || busy}
              onChange={(e) => {
                setLineId(e.target.value);
                setAcknowledged(false);
              }}
            >
              <option value="">選擇項次</option>
              {source.lines.map((item) => (
                <option key={item.lineId} value={item.lineId}>
                  {item.title} · {item.agreedQuantity} {item.unit}
                </option>
              ))}
            </select>
          </label>
          {line && (
            <p>
              已確認原始合約項次：{line.title} — {line.agreedQuantity} {line.unit}。
              WBS 不推定數量、完成或驗收。
            </p>
          )}
          <label>
            WBS 上層 Deliverable
            <select
              value={parentId}
              disabled={disabled || busy}
              onChange={(e) => {
                setParentId(e.target.value);
                setAcknowledged(false);
              }}
            >
              <option value="">Project WBS 根節點</option>
              {nodes.filter((n) => n.kind === "DELIVERABLE").map((n) => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
          </label>
          <label>
            Work Package 名稱
            <input
              value={title}
              maxLength={200}
              disabled={disabled || busy}
              onChange={(e) => {
                setTitle(e.target.value);
                setAcknowledged(false);
              }}
            />
          </label>
          <label>
            工作說明
            <textarea
              value={description}
              maxLength={10000}
              disabled={disabled || busy}
              onChange={(e) => {
                setDescription(e.target.value);
                setAcknowledged(false);
              }}
            />
          </label>
          <label>
            交付成果（人工定義）
            <textarea
              value={deliverable}
              maxLength={10000}
              disabled={disabled || busy}
              onChange={(e) => {
                setDeliverable(e.target.value);
                setAcknowledged(false);
              }}
            />
          </label>
          <label>
            驗收條件（人工定義）
            <textarea
              value={acceptanceCriteria}
              maxLength={10000}
              disabled={disabled || busy}
              onChange={(e) => {
                setAcceptanceCriteria(e.target.value);
                setAcknowledged(false);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={disabled || busy}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            我確認選定的 Project 可以接收這項經授權的 Contract 規劃參照，
            並已人工核對 WBS 工作包與驗收內容。
          </label>
          <button
            disabled={!allowed}
            onClick={() => {
              if (!source || !line || !allowed) return;
              void onImport({
                action: "import-contract",
                acknowledged: true,
                source: {
                  repositoryId: source.repositoryId,
                  contractId: source.contractId,
                  contractRevisionId: source.revisionId,
                  lineId: line.lineId,
                },
                node: {
                  id: crypto.randomUUID(),
                  parentId: parentId || null,
                  position: nodes.filter((n) => n.parentId === (parentId || null)).length,
                  kind: "WORK_PACKAGE",
                  title: title.trim(),
                  description,
                  deliverable,
                  acceptanceCriteria,
                },
              });
              setAcknowledged(false);
            }}
          >
            確認建立 Project WBS Work Package
          </button>
        </>
      )}
      <p>
        只有 WBS Owner 的成功回執才代表工作包已建立；後續 Baseline 仍需獨立提案審核。
      </p>
    </section>
  );
}
