"use client";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import styles from "./insights-panel.module.css";
import { insightsView } from "./insights-response";
import RepositoryPageHeader from "./repository-page-header";

const date = (value: number) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
const differenceLabels = { ADDED: "新增", REMOVED: "移除", CHANGED: "修改" };
export default function InsightsPanel({
  liffId,
  ownerLogin,
  repositoryName,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
}) {
  const [view, setView] = useState<ReturnType<typeof insightsView> | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const clear = useCallback(() => {
    generation.current++;
    setView(null);
    setBusy(false);
  }, []);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setView(null);
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const to = Date.now();
      const query = new URLSearchParams({
        owner: ownerLogin,
        name: repositoryName,
        from: String(Math.max(0, to - days * 86400000)),
        to: String(to),
      });
      const response = await fetch(`/api/repository-insights?${query}`, {
        cache: "no-store",
        headers: { "X-App-Session-Generation": token },
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Insights 暫時不可用。",
        );
      const next = insightsView(body);
      if (ticket === generation.current) setView(next);
    } catch (cause) {
      if (ticket === generation.current)
        setError(cause instanceof Error ? cause.message : "Insights 讀取失敗。");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, [days, liffId, ownerLogin, repositoryName]);
  const visibility = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current && document.visibilityState === "visible") void load();
  }, [load]);
  useEffect(() => {
    const onVisibility = () => visibility();
    const unsubscribe = liffClient.onSessionBlocked(clear);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clear);
    return () => {
      generation.current++;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [clear]);
  return (
    <>
      <RepositoryPageHeader
        ownerLogin={ownerLogin}
        repositoryName={repositoryName}
        active="insights"
        canManage={view?.canManageRepository ?? false}
      />
      <MiniAppRuntime
        liffId={liffId}
        onReady={async () => {
          initialized.current = true;
          await load();
        }}
        onWait={clear}
      />
      <div className={styles.toolbar}>
        <label>
          Issue 活動期間{" "}
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>最近 7 日</option>
            <option value={30}>最近 30 日</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => void load()}>
          重新整理
        </button>
      </div>
      {busy && <p role="status">正在讀取 Insights…</p>}
      {error && <p role="alert">{error}</p>}
      {!view && !busy && !error && <p>請完成 LINE 登入以查看 Repository Insights。</p>}
      {view && (
        <div className={styles.sections}>
          <p className={styles.context}>
            更新時間：{date(view.observedAt)}（Asia/Taipei）
            <br />
            活動期間：{date(view.from)} 至 {date(view.to)}，包含起點、不含終點。各來源獨立讀取。
          </p>
          <section className={styles.panel}>
            <h2>Issue 活動</h2>
            {view.issues ? (
              <>
                <dl className={styles.metrics}>
                  <div>
                    <dt>新增</dt>
                    <dd>{view.issues.created}</dd>
                  </div>
                  <div>
                    <dt>關閉</dt>
                    <dd>{view.issues.closed}</dd>
                  </div>
                  <div>
                    <dt>重開</dt>
                    <dd>{view.issues.reopened}</dd>
                  </div>
                </dl>
                <p>
                  關閉／重開僅統計已記錄事件。歷史未涵蓋 Issue：{view.issues.legacyIssues}
                  ；未結構化事件：{view.issues.unstructuredEvents}。
                </p>
                <h3>目前工作狀態</h3>
                <p>此分布為目前狀態，不受上方活動期間限制；與 Issue 開啟／關閉分開。</p>
                <dl className={styles.metrics}>
                  {Object.entries(view.issues.workflow).map(([key, value]) => (
                    <div key={key}>
                      <dt>
                        {
                          {
                            pending: "待處理",
                            active: "進行中",
                            review: "待審核",
                            completed: "已完成",
                          }[key]
                        }
                      </dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p role="status">Issue 來源暫時不可用，無法顯示指標。</p>
            )}
          </section>
          <section className={styles.panel}>
            <h2>WBS 目前規劃</h2>
            {view.wbs ? (
              <>
                {!view.wbs.initialized && <p>尚未建立 WBS。</p>}
                <p>待審提案：{view.wbs.pendingProposals}</p>
                <p>
                  {view.wbs.baseline
                    ? `正式基準 #${view.wbs.baseline.number} · 發布於 ${date(view.wbs.baseline.publishedAt)}`
                    : "尚無正式基準，無法比較草稿差異。"}
                </p>
                {view.wbs.differences !== null && (
                  <>
                    <h3>草稿與正式基準差異</h3>
                    {view.wbs.differences.length ? (
                      <ul>
                        {view.wbs.differences.map((item) => (
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
                <p>正式基準代表已發布範圍，不代表交付驗收或專案完成率。</p>
              </>
            ) : (
              <p role="status">WBS 來源暫時不可用，無法顯示規劃資訊。</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
