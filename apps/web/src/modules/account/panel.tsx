"use client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { miniAppEntryUrl } from "../../shared/presentation/entry-route";
import { DailyCheckInWheel } from "./daily-check-in-wheel";
import { GoogleConfirmation, GoogleConnection } from "./google-connection";
import { useUser } from "./use-user";

export default function MemberPanel({
  liffId,
  miniAppUrl,
}: {
  liffId: string;
  miniAppUrl: string;
}) {
  const {
    user,
    token,
    busy,
    lineName,
    inClient,
    error,
    pauseConfirmation,
    notice,
    unresolvedCheckIn,
    initialize,
    refresh,
    action,
    setBusy,
    setPauseConfirmation,
    pending,
    googleLink,
  } = useUser(liffId);
  return (
    <div className="membership-panel">
      <MiniAppRuntime liffId={liffId} onReady={initialize} onWait={() => setBusy(false)} />
      <header className="membership-hero">
        <div className="membership-emblem" aria-hidden="true">
          <svg
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          >
            <circle cx="32" cy="21" r="10" />
            <path d="M12 54v-5a20 20 0 0 1 40 0v5H12Z" />
          </svg>
        </div>
        <p className="eyebrow">工作助手</p>
        <h2>帳號與會員</h2>
        <p>你的 LINE 身分、會員資格與帳號關聯；工作範圍由各自的 owner 決定。</p>
      </header>
      {busy && <p role="status">正在確認會員資料…</p>}
      {error && (
        <p className="expense-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {user &&
        ("unavailable" in user.coins ? (
          <section className="membership-coins">
            <h2>每日簽到</h2>
            <p role="status">簽到與 Coin 狀態暫不可用；帳號與會員資料仍可使用。</p>
          </section>
        ) : (
          <DailyCheckInWheel
            active={user.status === "active"}
            busy={busy}
            coins={user.coins}
            identityKey={user.id}
            unresolvedDay={unresolvedCheckIn}
            onCheckIn={(retryOriginal) => action("checkIn", { retryOriginal })}
          />
        ))}
      {token && !user && !busy && !error && (
        <section>
          <h2>加入 LINE 會員</h2>
          <p>LINE：{lineName}</p>
          <p>加入後即可簽到、打卡與記帳，不需要 Google 帳號。</p>
          <button disabled={busy} onClick={() => action("register")}>
            加入會員
          </button>
        </section>
      )}
      {user?.status === "active" && pending?.email && (
        <GoogleConfirmation
          busy={busy}
          lineName={lineName}
          googleEmail={pending.email}
          onConfirm={() => void googleLink("confirm")}
          onCancel={() => void googleLink("cancel")}
        />
      )}
      {user?.status === "active" && (
        <section>
          <h2>會員與帳號關聯</h2>
          <label>
            會員編號（供管理者加入打卡地點）
            <input readOnly value={user.id} />
          </label>
          <p>會員已啟用</p>
          <p>LINE：{lineName}</p>
          <GoogleConnection
            googleEmail={user.googleEmail}
            pending={!!pending}
            busy={busy}
            onStart={() => void googleLink("start")}
            onCancel={() => void googleLink("cancel")}
            onUnlink={() => void googleLink("unlink")}
          />
          {!inClient && <a href={miniAppEntryUrl(miniAppUrl, "membership")}>返回 LINE 帳號設定</a>}
          {!pauseConfirmation ? (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setPauseConfirmation(true)}
            >
              暫停會員功能
            </button>
          ) : (
            <>
              <p>暫停後無法使用 Bot 與支出操作，帳號關聯與原資料保留。以原帳號確認即可恢復。</p>
              <button disabled={busy} onClick={() => action("deactivate")}>
                確認暫停
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setPauseConfirmation(false)}
              >
                維持啟用
              </button>
            </>
          )}
        </section>
      )}
      {user?.status === "paused" && (
        <section>
          <h2>會員功能已暫停</h2>
          <p>帳號關聯與原有資料保留。</p>
          <button disabled={busy} onClick={() => action("restore")}>
            恢復會員功能
          </button>
        </section>
      )}
      {user?.status === "suspended" && (
        <section>
          <h2>會員已停權</h2>
          <p>請聯絡管理者協助。</p>
        </section>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          void refresh();
        }}
      >
        重新整理狀態
      </button>
    </div>
  );
}
