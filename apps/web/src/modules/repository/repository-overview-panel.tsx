"use client";

import type { PublicRepository } from "@line_bot_v1/repository/contracts/output/public";
import {
  parseRepositoryOverview,
  type RepositoryOverview,
} from "@line_bot_v1/repository/contracts/overview";
import { hasRepositoryPermission } from "@line_bot_v1/repository/domain/repository/value-objects/repository-capability";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import {
  ensureLineServiceSession,
  lineSessionEstablished,
  lineSessionHintAvailable,
} from "../../shared/browser/line-service-session";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { ActionRow, PageState } from "../../shared/ui/page-layout";
import RepositoryPageHeader from "./repository-page-header";
import RepositorySubscriptionControl from "./repository-subscription-control";
import {
  repositoryContentPath,
  repositoryContractsPath,
  repositoryDiscussionsPath,
  repositoryExecutionsPath,
  repositoryIssuesPath,
  repositoryPath,
  repositoryResourcesPath,
} from "./resource-navigation";

import { errorMessage } from "./response-validation";

function visibilityLabel(value: RepositoryOverview["repository"]["visibility"]) {
  if (value === "private") return "Private";
  if (value === "internal") return "Internal";
  return "Public";
}

function documentIsHidden() {
  return document.visibilityState === "hidden";
}

export default function RepositoryOverviewPanel({
  liffId,
  ownerLogin,
  repositoryName,
  publicRepository,
  publicLookupUnavailable,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  publicRepository: PublicRepository | null;
  publicLookupUnavailable: boolean;
}) {
  const [overview, setOverview] = useState<RepositoryOverview | null>(null);
  const [activated, setActivated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const generation = useRef(0);
  const ready = useRef(false);
  const explicitSession = useRef(false);
  const request = useRef<AbortController | null>(null);

  const canonicalOwner =
    overview?.repository.ownerLogin ?? publicRepository?.ownerLogin ?? ownerLogin;
  const canonicalName = overview?.repository.name ?? publicRepository?.name ?? repositoryName;
  const canManage = overview?.repository.permissions
    ? hasRepositoryPermission(overview.repository.permissions, "admin")
    : false;

  const clear = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    setOverview(null);
    setBusy(false);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    if (documentIsHidden()) {
      clear();
      return;
    }
    const ticket = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOverview(null);
    setBusy(true);
    setError(null);
    try {
      const explicit = explicitSession.current;
      explicitSession.current = false;
      const token = explicit
        ? await liffClient.startSession(liffId)
        : await ensureLineServiceSession();
      if (ticket !== generation.current || documentIsHidden()) return;
      if (!token) return;
      const query = new URLSearchParams({ owner: ownerLogin, name: repositoryName });
      const response = await fetch(`/api/repository-overview?${query.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        headers: { "X-App-Session-Generation": token },
      });
      if (ticket !== generation.current || documentIsHidden()) return;
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // A bounded fallback below preserves the HTTP status without trusting a malformed body.
      }
      if (ticket !== generation.current || documentIsHidden()) return;
      if (!response.ok) {
        throw Object.assign(new Error(errorMessage(payload, "Repository Overview 讀取失敗。")), {
          status: response.status,
        });
      }
      const next = parseRepositoryOverview(payload);
      const currentToken = await ensureLineServiceSession();
      if (ticket !== generation.current || documentIsHidden() || currentToken !== token) return;
      setOverview(next);
    } catch (cause) {
      if (ticket === generation.current) {
        setOverview(null);
        setError({
          status:
            cause !== null &&
            typeof cause === "object" &&
            "status" in cause &&
            typeof cause.status === "number"
              ? cause.status
              : 503,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (ticket === generation.current) setBusy(false);
    }
  }, [clear, liffId, ownerLogin, repositoryName]);

  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clear();
    else if (ready.current && activated) void load();
  });
  useEffect(() => {
    const visibilityChange = () => onVisibilityChange();
    const unsubscribe = liffClient.onSessionBlocked(clear);
    document.addEventListener("visibilitychange", visibilityChange);
    window.addEventListener("pagehide", clear);
    return () => {
      generation.current += 1;
      request.current?.abort();
      request.current = null;
      unsubscribe();
      document.removeEventListener("visibilitychange", visibilityChange);
      window.removeEventListener("pagehide", clear);
    };
  }, [clear]);

  useEffect(() => {
    if (lineSessionEstablished() || lineSessionHintAvailable()) {
      setActivated(true);
    }
  }, []);

  const activate = () => {
    explicitSession.current = true;
    if (activated && ready.current) void load();
    else setActivated(true);
  };

  const restricted =
    error && (error.status === 401 || error.status === 403 || error.status === 404);
  const baseOwner = canonicalOwner;
  const baseName = canonicalName;
  const basePath = repositoryPath(baseOwner, baseName);

  return (
    <>
      <RepositoryPageHeader
        ownerLogin={baseOwner}
        repositoryName={baseName}
        active="overview"
        canManage={canManage}
        {...(publicRepository
          ? { back: `/${encodeURIComponent(publicRepository.ownerLogin)}` }
          : {})}
      />
      {activated && (
        <MiniAppRuntime
          liffId={liffId}
          onReady={async () => {
            ready.current = true;
            await load();
          }}
          onWait={() => {
            ready.current = false;
            clear();
          }}
        />
      )}

      <div className="crud-manager">
        <section className="crud-detail" aria-labelledby="repository-delivery-heading">
          <div className="crud-detail-head">
            <div>
              <h2 id="repository-delivery-heading">工作交付</h2>
              <p>從計畫、實體資源與承諾，到 Task 實績與審查。</p>
            </div>
          </div>
          <div className="menu-group">
            <ActionRow
              href={repositoryContentPath(baseOwner, baseName)}
              title="Content"
              description="管理 Subject、Object、SubObject、Work 與 Task 的版本化工作計畫。"
            />
            <ActionRow
              href={repositoryResourcesPath(baseOwner, baseName)}
              title="Resources"
              description="管理 Location、Equipment 與 Material 的實體資源身份。"
            />
            <ActionRow
              href={repositoryContractsPath(baseOwner, baseName)}
              title="Contracts"
              description="建立工作承諾、約定數量，並管理草稿、啟用與結案。"
            />
            <ActionRow
              href={repositoryExecutionsPath(baseOwner, baseName)}
              title="Executions"
              description="提交 Task 實績、記錄依賴與 Resources，並完成審查。"
            />
          </div>
        </section>
        <section className="crud-detail" aria-labelledby="repository-collaboration-heading">
          <div className="crud-detail-head">
            <div>
              <h2 id="repository-collaboration-heading">協作與知識</h2>
              <p>追蹤工作、討論與維護 Repository 知識。</p>
            </div>
          </div>
          <div className="menu-group">
            <ActionRow
              href={repositoryIssuesPath(baseOwner, baseName)}
              title="Issues"
              description="追蹤需要處理的工作與決策。"
            />
            <ActionRow
              href={repositoryDiscussionsPath(baseOwner, baseName)}
              title="Discussions"
              description="進行 Repository 範圍內的討論。"
            />
            <ActionRow
              href={`${basePath}/wiki`}
              title="Wiki"
              description="維護 Repository 的知識與說明。"
            />
            <ActionRow
              href={`${basePath}/insights`}
              title="Insights"
              description="查看 Repository 的 Issue 活動。"
            />
          </div>
        </section>
        <section className="crud-detail" aria-labelledby="repository-context-heading">
          <div className="crud-detail-head">
            <div>
              <h2 id="repository-context-heading">專案規劃</h2>
              <p>前往專案規劃與 WBS。</p>
            </div>
          </div>
          <div className="menu-group">
            <ActionRow href="/projects" title="Projects" description="前往 Project 工作空間。" />
          </div>
        </section>

        {busy && <p role="status">正在讀取 Repository 資訊…</p>}
        {restricted && !publicRepository && (
          <PageState
            tone="restricted"
            title="無法讀取 Repository"
            action={
              <button type="button" className="secondary" disabled={busy} onClick={activate}>
                重新登入並重試
              </button>
            }
          >
            {error.message}
          </PageState>
        )}
        {error && (!restricted || publicRepository) && (
          <PageState
            tone="error"
            title="Repository 資訊讀取失敗"
            action={
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={restricted ? activate : () => void load()}
              >
                {restricted ? "重新登入並重試" : "重試 Repository 資訊"}
              </button>
            }
          >
            {error.message}
          </PageState>
        )}
        {!overview && publicLookupUnavailable && !busy && (
          <PageState
            tone="error"
            title="公開 Repository 資訊暫時無法確認"
            action={
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => window.location.reload()}
                >
                  重試公開資訊
                </button>
                <button type="button" className="secondary" onClick={activate}>
                  登入以讀取 Repository
                </button>
              </>
            }
          >
            目前無法確認這個 Repository 是否公開。你仍可登入以讀取有權限的 Repository。
          </PageState>
        )}
        {!overview && publicRepository && !busy && !error && (
          <section className="crud-detail" aria-labelledby="public-repository-heading">
            <h2 id="public-repository-heading">Public Repository</h2>
            <p className="crud-lifecycle-note">這個 Repository 的公開內容不需要登入即可瀏覽。</p>
            <button type="button" className="secondary" onClick={activate}>
              登入以顯示 Repository 權限
            </button>
          </section>
        )}
        {!overview && !publicRepository && !publicLookupUnavailable && !busy && !error && (
          <PageState
            tone="restricted"
            title="登入後讀取 Repository"
            action={
              <button type="button" className="secondary" onClick={activate}>
                登入以讀取 Repository
              </button>
            }
          >
            Private 與 Internal Repository 需要目前已驗證的使用者權限。
          </PageState>
        )}
        {overview && (
          <section className="crud-detail" aria-labelledby="repository-state-heading">
            <h2 id="repository-state-heading">Repository 狀態</h2>
            <dl>
              <div>
                <dt>Visibility</dt>
                <dd>{visibilityLabel(overview.repository.visibility)}</dd>
              </div>
              <div>
                <dt>Lifecycle</dt>
                <dd>{overview.repository.archived ? "Archived" : "Active"}</dd>
              </div>
              <div>
                <dt>Current permissions</dt>
                <dd>
                  {overview.repository.permissions.length
                    ? overview.repository.permissions.join(", ")
                    : "Public read only"}
                </dd>
              </div>
            </dl>
            {overview.legacyWbs.status === "available" && (
              <p>
                <Link href={`${basePath}/wbs`}>開啟舊 WBS 與移轉</Link>
              </p>
            )}
            {overview.legacyWbs.status === "unavailable" && (
              <div role="alert">
                <p>舊 WBS 狀態暫時無法確認。</p>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  重試 Repository 資訊
                </button>
              </div>
            )}
          </section>
        )}

        <RepositorySubscriptionControl
          key={repositoryPath(baseOwner, baseName)}
          liffId={liffId}
          ownerLogin={baseOwner}
          repositoryName={baseName}
          explicitInteraction
        />
      </div>
    </>
  );
}
