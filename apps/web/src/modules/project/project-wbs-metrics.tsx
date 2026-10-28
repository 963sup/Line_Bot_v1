"use client";

import { isRecord } from "@line_bot_v1/platform/validation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import styles from "./project-wbs-panel.module.css";

const differenceLabels = { ADDED: "新增", REMOVED: "刪除", CHANGED: "修改" } as const;

type MetricsResponse = Readonly<{
  actorUserId: string;
  projectId: string;
  metrics: Readonly<{
    initialized: boolean;
    pendingProposals: number;
    baseline: Readonly<{ number: number; publishedAt: number }> | null;
    differences:
      | readonly Readonly<{
          nodeId: string;
          title: string;
          kind: keyof typeof differenceLabels;
        }>[]
      | null;
  }>;
}>;

function nonNegativeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error("Project WBS 指標格式不正確。");
  return Number(value);
}

function metricsResponse(value: unknown): MetricsResponse {
  if (!isRecord(value) || !isRecord(value.metrics))
    throw new Error("Project WBS 指標回應格式不正確。");
  const metrics = value.metrics;
  if (typeof metrics.initialized !== "boolean") throw new Error("Project WBS 指標格式不正確。");
  const baseline = metrics.baseline;
  if (baseline !== null && !isRecord(baseline))
    throw new Error("Project WBS Baseline 格式不正確。");
  if (metrics.differences !== null && !Array.isArray(metrics.differences))
    throw new Error("Project WBS 差異格式不正確。");
  const differences =
    metrics.differences === null
      ? null
      : metrics.differences.map((value) => {
          if (
            !isRecord(value) ||
            typeof value.nodeId !== "string" ||
            typeof value.title !== "string" ||
            (value.kind !== "ADDED" && value.kind !== "REMOVED" && value.kind !== "CHANGED") ||
            !Array.isArray(value.fields)
          )
            throw new Error("Project WBS 差異格式不正確。");
          const kind: keyof typeof differenceLabels = value.kind;
          return { nodeId: value.nodeId, title: value.title, kind };
        });
  return {
    actorUserId:
      typeof value.actorUserId === "string"
        ? value.actorUserId
        : (() => {
            throw new Error("Project WBS 使用者格式不正確。");
          })(),
    projectId:
      typeof value.projectId === "string"
        ? value.projectId
        : (() => {
            throw new Error("Project WBS 識別格式不正確。");
          })(),
    metrics: {
      initialized: metrics.initialized,
      pendingProposals: nonNegativeInteger(metrics.pendingProposals),
      baseline:
        baseline === null
          ? null
          : {
              number: nonNegativeInteger(baseline.number),
              publishedAt: nonNegativeInteger(baseline.publishedAt),
            },
      differences,
    },
  };
}

function errorMessage(status: number, body: unknown) {
  if (status === 404) return "找不到 Project WBS，或目前使用者已失去存取權。";
  if (status === 503) return "Project WBS 資料來源暫時不可用，請稍後重試。";
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return "Project WBS 指標讀取失敗。";
}

export default function ProjectWbsMetrics({
  liffId,
  projectId,
  actorUserId,
  version,
  governanceVersion,
  onAccessLost,
}: {
  liffId: string;
  projectId: string;
  actorUserId: string;
  version: number;
  governanceVersion?: number;
  onAccessLost(message: string): void;
}) {
  const [metrics, setMetrics] = useState<MetricsResponse["metrics"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const accessLost = useEffectEvent(onAccessLost);
  const clear = useEffectEvent(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setMetrics(null);
    setBusy(false);
    setError("");
  });
  const load = useCallback(async () => {
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    const ticket = ++generation.current;
    const expectedActor = actorUserId;
    setMetrics(null);
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw Object.assign(new Error("請完成 LINE 登入後重試。"), { status: 401 });
      if (ticket !== generation.current || requestController.signal.aborted) return;
      const response = await fetch(
        `/api/project-wbs/metrics?${new URLSearchParams({ projectId })}`,
        {
          cache: "no-store",
          headers: { "X-App-Session-Generation": token },
          signal: requestController.signal,
        },
      );
      const body: unknown = await response.json();
      if (!response.ok)
        throw Object.assign(new Error(errorMessage(response.status, body)), {
          status: response.status,
        });
      const next = metricsResponse(body);
      if (ticket !== generation.current || requestController.signal.aborted) return;
      if (next.actorUserId !== expectedActor || next.projectId !== projectId)
        throw Object.assign(new Error("登入身分已改變，請重新載入 Project。"), { status: 403 });
      setMetrics(next.metrics);
    } catch (cause) {
      if (
        ticket !== generation.current ||
        requestController.signal.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError")
      )
        return;
      setMetrics(null);
      const status =
        cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      if (status === 401 || status === 403 || status === 404) accessLost(message);
    } finally {
      if (ticket === generation.current) {
        if (controller.current === requestController) controller.current = null;
        setBusy(false);
      }
    }
  }, [actorUserId, liffId, projectId]);

  useEffect(() => {
    void version;
    void governanceVersion;
    void load();
    return () => {
      generation.current++;
      controller.current?.abort();
      controller.current = null;
    };
  }, [load, version, governanceVersion]);
  useEffect(() => {
    const unsubscribe = liffClient.onSessionBlocked(() => clear());
    const onHide = () => clear();
    window.addEventListener("pagehide", onHide);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return (
    <section className={styles.panel} aria-label="Project WBS 規劃指標">
      <h2>WBS 目前規劃</h2>
      {busy && <p role="status">正在讀取 WBS 規劃資訊…</p>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => void load()}>
          重新載入規劃資訊
        </button>
      </div>
      {metrics && (
        <>
          <p>{metrics.initialized ? "WBS 已初始化。" : "尚未建立 WBS。"}</p>
          <p>待審提案：{metrics.pendingProposals}</p>
          <p>
            {metrics.baseline
              ? `正式基準 #${metrics.baseline.number} · 發布於 ${new Date(metrics.baseline.publishedAt).toLocaleString()}`
              : "尚無正式基準，無法比較草稿差異。"}
          </p>
          {metrics.differences !== null && (
            <>
              <h3>草稿與正式基準差異</h3>
              {metrics.differences.length ? (
                <ul>
                  {metrics.differences.map((item) => (
                    <li key={item.nodeId}>
                      {differenceLabels[item.kind]}：{item.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>草稿與正式基準內容相同。</p>
              )}
            </>
          )}
          <p>正式基準代表已發布範圍，不代表交付驗收或 Project 完成率。</p>
        </>
      )}
    </section>
  );
}
