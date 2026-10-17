"use client";

import { parseProjectWbsGovernanceCommand } from "@line_bot_v1/wbs/application/commands/project-governance";
import type {
  ProjectWbsGovernanceCommand,
  ProjectWbsGovernanceQuery,
  ProjectWbsGovernanceView,
} from "@line_bot_v1/wbs/contracts/dto/project-governance";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import {
  projectWbsGovernanceReceipt,
  projectWbsGovernanceView,
} from "./project-wbs-governance-response";
import styles from "./project-wbs-panel.module.css";

type Pending = { actor: string; command: ProjectWbsGovernanceCommand };
type Intent = ProjectWbsGovernanceCommand extends infer C
  ? C extends ProjectWbsGovernanceCommand
    ? Omit<C, "requestId" | "projectId" | "expectedVersion">
    : never
  : never;
const fieldLabels: Record<string, string> = {
  title: "名稱",
  kind: "類型",
  parentId: "父節點",
  position: "順序",
  description: "說明",
  deliverable: "交付成果",
  acceptanceCriteria: "驗收要求",
};

export default function ProjectWbsGovernancePanel({
  liffId,
  projectId,
  actorUserId,
  draftRevisionId,
  disabled,
  onAccessLost,
}: {
  liffId: string;
  projectId: string;
  actorUserId: string;
  draftRevisionId: string;
  disabled: boolean;
  onAccessLost(message: string): void;
}) {
  const [view, setView] = useState<ProjectWbsGovernanceView | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [title, setTitle] = useState(""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState("");
  const [minimum, setMinimum] = useState(1),
    [selfApproval, setSelfApproval] = useState(true);
  const generation = useRef(0),
    locked = useRef(false),
    pendingRef = useRef<Pending | null>(null);
  const queryRef = useRef<ProjectWbsGovernanceQuery>({});
  const endpoint = `/api/project-wbs/governance?${new URLSearchParams({ projectId })}`;
  const storageKey = `project-wbs-governance:${projectId}:${actorUserId}`;
  const remember = useCallback(
    (value: Pending | null) => {
      pendingRef.current = value;
      setPending(value);
      try {
        if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* In-memory exact retry remains available when browser storage is blocked. */
      }
    },
    [storageKey],
  );
  const request = useCallback(
    async (url: string, command?: ProjectWbsGovernanceCommand): Promise<unknown> => {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw Object.assign(new Error("請完成 LINE 登入。"), { status: 401 });
      const response = await fetch(url, {
        method: command ? "POST" : "GET",
        cache: "no-store",
        headers: {
          "X-App-Session-Generation": token,
          ...(command ? { "Content-Type": "application/json" } : {}),
        },
        ...(command ? { body: JSON.stringify(command) } : {}),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(
            body && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : "WBS 治理服務暫時不可用。",
          ),
          { status: response.status },
        );
      return body;
    },
    [liffId],
  );
  const load = useCallback(
    async (query?: ProjectWbsGovernanceQuery) => {
      const ticket = ++generation.current;
      setBusy(true);
      setError("");
      if (query) queryRef.current = query;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryRef.current)) params.set(key, String(value));
      try {
        const next = projectWbsGovernanceView(await request(`${endpoint}&${params}`));
        if (ticket !== generation.current) return;
        if (next.actorUserId !== actorUserId || next.project.id !== projectId)
          throw Object.assign(new Error("登入身分已改變，請重新載入 WBS。"), { status: 403 });
        setView(next);
        setMinimum(next.policy.minimumApprovals);
        setSelfApproval(next.policy.allowSelfApproval);
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw) {
            const saved: unknown = JSON.parse(raw);
            if (
              !saved ||
              typeof saved !== "object" ||
              !("actor" in saved) ||
              saved.actor !== actorUserId ||
              !("command" in saved)
            )
              throw new Error();
            const command = parseProjectWbsGovernanceCommand(saved.command);
            if (command.projectId !== projectId) throw new Error();
            remember({ actor: actorUserId, command });
          }
        } catch {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* Storage may be blocked. */
          }
        }
      } catch (cause) {
        if (ticket !== generation.current) return;
        setView(null);
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          [401, 403, 404].includes(Number(cause.status))
        ) {
          remember(null);
          onAccessLost(cause instanceof Error ? cause.message : "WBS 存取已失效。");
        }
        setError(cause instanceof Error ? cause.message : "WBS 治理資料讀取失敗。");
      } finally {
        if (ticket === generation.current) setBusy(false);
      }
    },
    [endpoint, actorUserId, projectId, request, storageKey, remember, onAccessLost],
  );
  const clear = useEffectEvent(() => {
    generation.current++;
    setView(null);
    setPending(null);
    pendingRef.current = null;
    setError("");
    setNotice("");
    setNote("");
    setTitle("");
    setReason("");
    setBusy(false);
  });
  const visible = useEffectEvent(() => {
    clear();
    if (document.visibilityState === "visible") void load();
  });
  useEffect(() => {
    void draftRevisionId;
    void load();
    return () => {
      generation.current++;
    };
  }, [load, draftRevisionId]);
  useEffect(() => {
    const onVisibility = () => visible(),
      onHide = () => clear();
    const unsubscribe = liffClient.onSessionBlocked(onHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      generation.current++;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
  async function execute(intent?: Intent) {
    if (!view || locked.current || disabled) return;
    locked.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const operation =
        pendingRef.current ??
        (intent
          ? {
              actor: actorUserId,
              command: parseProjectWbsGovernanceCommand({
                ...intent,
                projectId,
                expectedVersion: view.version,
                requestId: crypto.randomUUID(),
              }),
            }
          : null);
      if (!operation) return;
      let verified: ProjectWbsGovernanceView;
      try {
        verified = projectWbsGovernanceView(await request(endpoint));
      } catch (cause) {
        if (
          cause &&
          typeof cause === "object" &&
          "status" in cause &&
          [401, 403, 404].includes(Number(cause.status))
        ) {
          remember(null);
          onAccessLost(cause instanceof Error ? cause.message : "WBS 存取已失效。");
        }
        throw cause;
      }
      if (ticket !== generation.current) return;
      if (
        verified.actorUserId !== operation.actor ||
        verified.project.id !== operation.command.projectId
      ) {
        remember(null);
        setView(null);
        throw new Error("登入身分已改變，請重新載入 WBS。");
      }
      remember(operation);
      const receipt = projectWbsGovernanceReceipt(
        await request("/api/project-wbs/governance", operation.command),
      );
      if (ticket !== generation.current) return;
      if (
        receipt.requestId !== operation.command.requestId ||
        receipt.projectId !== projectId ||
        receipt.action !== operation.command.action ||
        receipt.version !== operation.command.expectedVersion + 1
      )
        throw new Error("治理結果無法確認，請重試原操作。");
      remember(null);
      setNote("");
      setNotice(
        receipt.action === "publish-proposal"
          ? "正式 Baseline 已發布；草稿保留原本內容。這不代表交付驗收完成。"
          : "治理操作已保存。",
      );
      await load({
        ...(receipt.proposalId ? { proposalId: receipt.proposalId } : queryRef.current),
        ...(receipt.baselineId ? { baselineId: receipt.baselineId } : {}),
      });
    } catch (cause) {
      if (ticket !== generation.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0;
      if (status >= 400 && status < 500) remember(null);
      if ([401, 403, 404].includes(status)) {
        setView(null);
        onAccessLost(cause instanceof Error ? cause.message : "WBS 存取已失效。");
        return;
      }
      setError(cause instanceof Error ? cause.message : "結果未知，請重試原操作。");
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }
  const waiting = busy || disabled || Boolean(pending);
  const selected = view?.proposal;
  const item = selected?.proposal;
  const currentProposal = item && selected?.currentVersion === item.version;
  const selfReview = item?.authorUserId === actorUserId || item?.proposerUserId === actorUserId;
  const proposalScope = item
    ? { proposalId: item.id, expectedProposalVersion: item.version }
    : null;
  return (
    <section className={styles.panel} aria-label="WBS 正式範圍治理">
      <h2>正式範圍與變更提案</h2>
      <p>草稿可持續編輯。審查固定版本後才能發布正式範圍；交付驗收另行進行。</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className={styles.actions}>
        <button disabled={busy || disabled} onClick={() => void load()}>
          重新載入治理資料
        </button>
        {pending && (
          <>
            <span>有一筆結果待確認的治理操作。</span>
            <button disabled={busy || disabled || !view} onClick={() => void execute()}>
              重試原治理操作
            </button>
          </>
        )}
      </div>
      {view && (
        <>
          <p>
            政策 v{view.policy.version}：至少 {view.policy.minimumApprovals} 位核准；
            {view.policy.allowSelfApproval ? "允許" : "不允許"}自我核准。
          </p>
          <p>
            {view.publishedBaseline
              ? `目前正式範圍：Baseline #${view.publishedBaseline.number}`
              : "尚未建立正式 Baseline，目前內容皆為草稿。"}
          </p>
          {view.closed && <p>Project 已關閉；治理資料僅供讀取。</p>}
          {view.baseline && (
            <details>
              <summary>
                查看 Baseline #{view.baseline.baseline.number} · 內容版本{" "}
                {view.baseline.revision.version}
              </summary>
              <p>
                發布者：{view.baseline.baseline.publishedBy} · 發布時核准{" "}
                {view.baseline.baseline.approvalReviewIds.length} 筆 · 政策 v
                {view.baseline.baseline.policy.version}
              </p>
              <ul>
                {view.baseline.revision.document.nodes.map((node) => (
                  <li key={node.id}>
                    <details>
                      <summary>
                        {node.title} · {node.kind === "WORK_PACKAGE" ? "工作包" : "交付項目"}
                      </summary>
                      <p>{node.description}</p>
                      <p>交付成果：{node.deliverable}</p>
                      <p>驗收要求：{node.acceptanceCriteria}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {view.canPropose && (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                void execute({
                  action: "create-proposal",
                  title,
                  reason,
                  candidateRevisionId: draftRevisionId,
                  baseBaselineId: view.publishedBaseline?.id ?? null,
                });
              }}
            >
              <h3>從目前草稿建立提案</h3>
              <label>
                提案名稱
                <input
                  required
                  maxLength={200}
                  value={title}
                  disabled={waiting}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                變更理由
                <textarea
                  maxLength={10000}
                  value={reason}
                  disabled={waiting}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button disabled={waiting} type="submit">
                建立變更提案
              </button>
            </form>
          )}
          <h3>變更提案</h3>
          {!view.proposals.length && <p>尚無提案。</p>}
          <ul>
            {view.proposals.map((p) => (
              <li key={p.id}>
                <button disabled={waiting} onClick={() => void load({ proposalId: p.id })}>
                  #{p.number} {p.title} ·{" "}
                  {p.status === "OPEN" ? "待審" : p.status === "PUBLISHED" ? "已發布" : "已關閉"}
                </button>
              </li>
            ))}
          </ul>
          {view.nextProposal !== null && (
            <button
              disabled={waiting}
              onClick={() => void load({ beforeProposal: view.nextProposal ?? 1 })}
            >
              更多提案
            </button>
          )}
          {selected && item && proposalScope && (
            <section aria-label="選定提案">
              {!currentProposal && (
                <p>
                  歷史提案版本（唯讀）。
                  <button disabled={waiting} onClick={() => void load({ proposalId: item.id })}>
                    返回最新提案
                  </button>
                </p>
              )}
              <h3>
                {item.title} · 提案 v{item.version}
              </h3>
              <p>{item.reason}</p>
              <p>
                候選內容版本 {selected.candidate.version} ·{" "}
                {selected.publication ? "發布時" : "目前"}有效核准 {selected.approvals} 筆
              </p>
              {selected.publication && (
                <p>
                  已發布 Baseline #{selected.publication.number}：採用提案 v
                  {selected.publication.proposalVersion} 與政策 v
                  {selected.publication.policy.version}。
                </p>
              )}
              {!selected.baseIsCurrent && item.status === "OPEN" && currentProposal && (
                <p role="status">正式基底已變更，需更新提案並重新審查。</p>
              )}
              {selected.failures.length ? (
                <ul aria-label="必要檢查未通過">
                  {selected.failures.map((failure) => (
                    <li key={`${failure.code}:${failure.nodeId}`}>{failure.message}</li>
                  ))}
                </ul>
              ) : (
                <p>必要內容檢查通過。</p>
              )}
              <h4>候選版本差異</h4>
              {selected.differences.map((difference) => (
                <details key={difference.nodeId}>
                  <summary>
                    {difference.kind === "ADDED"
                      ? "新增"
                      : difference.kind === "REMOVED"
                        ? "刪除"
                        : "修改"}
                    ：{difference.title}
                  </summary>
                  <dl>
                    {difference.fields.map((field) => (
                      <div key={field.field}>
                        <dt>{fieldLabels[field.field]}</dt>
                        <dd className={styles.difference}>
                          原值：{field.before ?? "無"}
                          <br />
                          新值：{field.after ?? "無"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
              <h4>版本綁定審查紀錄</h4>
              {!selected.reviews.length && <p>此提案尚無審查紀錄。</p>}
              <ul>
                {selected.reviews.map((review) => (
                  <li key={review.id}>
                    <button
                      disabled={waiting}
                      onClick={() =>
                        void load({ proposalId: item.id, proposalVersion: review.proposalVersion })
                      }
                    >
                      查看審查的提案 v{review.proposalVersion}
                    </button>{" "}
                    · 政策 v{review.policyVersion} ·{review.reviewerUserId}：
                    {review.decision === "APPROVE" ? "核准" : "要求修改"}
                    {!review.eligible && "（目前資格或政策不適用）"}
                    <p>{review.note}</p>
                  </li>
                ))}
              </ul>
              {selected.nextReview !== null && (
                <button
                  disabled={waiting}
                  onClick={() =>
                    void load({
                      ...queryRef.current,
                      proposalId: item.id,
                      beforeReview: selected.nextReview ?? 1,
                    })
                  }
                >
                  更多審查紀錄
                </button>
              )}
              {item.status === "OPEN" && currentProposal && (
                <>
                  {view.canPropose && (
                    <div className={styles.actions}>
                      <button
                        disabled={waiting}
                        onClick={() => {
                          if (window.confirm("以目前草稿及正式基底更新提案？既有審查將失效。"))
                            void execute({
                              action: "revise-proposal",
                              ...proposalScope,
                              title: item.title,
                              reason: item.reason,
                              candidateRevisionId: draftRevisionId,
                              baseBaselineId: view.publishedBaseline?.id ?? null,
                            });
                        }}
                      >
                        以目前草稿更新並重新審查
                      </button>
                      <button
                        disabled={waiting}
                        onClick={() => {
                          if (window.confirm("關閉此提案？提案與歷史審查會保留。"))
                            void execute({ action: "close-proposal", ...proposalScope });
                        }}
                      >
                        關閉提案
                      </button>
                    </div>
                  )}
                  {view.canReview && (
                    <>
                      <label className={styles.form}>
                        審查意見
                        <textarea
                          disabled={waiting}
                          maxLength={2000}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </label>
                      <div className={styles.actions}>
                        <button
                          disabled={waiting || (!view.policy.allowSelfApproval && selfReview)}
                          onClick={() =>
                            void execute({
                              action: "review-proposal",
                              ...proposalScope,
                              expectedPolicyVersion: view.policy.version,
                              decision: "APPROVE",
                              note,
                            })
                          }
                        >
                          核准此版本
                        </button>
                        <button
                          disabled={waiting || (!view.policy.allowSelfApproval && selfReview)}
                          onClick={() =>
                            void execute({
                              action: "review-proposal",
                              ...proposalScope,
                              expectedPolicyVersion: view.policy.version,
                              decision: "REQUEST_CHANGES",
                              note,
                            })
                          }
                        >
                          要求修改此版本
                        </button>
                        {view.canSetPolicy && (
                          <button
                            disabled={
                              waiting ||
                              !selected.baseIsCurrent ||
                              Boolean(selected.failures.length) ||
                              selected.blocked ||
                              selected.approvals < view.policy.minimumApprovals
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `將候選內容版本 ${selected.candidate.version} 發布為正式 Baseline？`,
                                )
                              )
                                void execute({
                                  action: "publish-proposal",
                                  ...proposalScope,
                                  expectedPolicyVersion: view.policy.version,
                                });
                            }}
                          >
                            發布正式 Baseline
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          <h3>Baseline 歷史</h3>
          <ul>
            {view.baselines.map((b) => (
              <li key={b.id}>
                <button disabled={waiting} onClick={() => void load({ baselineId: b.id })}>
                  Baseline #{b.number} · {new Date(b.at).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
          {view.nextBaseline !== null && (
            <button
              disabled={waiting}
              onClick={() => void load({ beforeBaseline: view.nextBaseline ?? 1 })}
            >
              更多 Baseline
            </button>
          )}
          {view.canSetPolicy && (
            <details>
              <summary>治理政策設定</summary>
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void execute({
                    action: "set-policy",
                    expectedPolicyVersion: view.policy.version,
                    minimumApprovals: minimum,
                    allowSelfApproval: selfApproval,
                  });
                }}
              >
                <p>政策變更後，未發布提案須依新政策重新審查。</p>
                <label>
                  必要核准人數
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={minimum}
                    disabled={waiting}
                    onChange={(e) => setMinimum(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={selfApproval}
                      disabled={waiting}
                      onChange={(e) => setSelfApproval(e.target.checked)}
                    />
                    允許自我核准
                  </span>
                </label>
                <button type="submit" disabled={waiting}>
                  更新治理政策
                </button>
              </form>
            </details>
          )}
        </>
      )}
    </section>
  );
}
