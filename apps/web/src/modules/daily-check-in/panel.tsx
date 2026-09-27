"use client";

import Link from "next/link";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageState } from "../../shared/ui/page-layout";
import { DailyCheckInWheel } from "./daily-check-in-wheel";
import { isCoinView, useDailyCheckIn } from "./use-daily-check-in";

export default function DailyCheckInPanel({ liffId }: { liffId: string }) {
  const { user, busy, error, notice, unresolvedDay, initialize, refresh, checkIn, setBusy } =
    useDailyCheckIn(liffId);

  return (
    <div className="daily-check-in-panel">
      <MiniAppRuntime liffId={liffId} onReady={initialize} onWait={() => setBusy(false)} />
      {busy && <p role="status">正在確認每日簽到狀態…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!busy && !error && !user && (
        <PageState
          title="尚未建立會員資格"
          action={
            <Link className="button-link button-link-primary" href="/membership/register">
              註冊會員
            </Link>
          }
        >
          每日簽到需要已註冊的 User。
        </PageState>
      )}
      {user && !isCoinView(user.coins) && (
        <PageState
          tone="error"
          title="每日簽到暫不可用"
          action={
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              重新讀取
            </button>
          }
        >
          Account 資料仍可使用；DailyCheckIn 或 Wallet projection 目前不可用。
        </PageState>
      )}
      {user && isCoinView(user.coins) && (
        <DailyCheckInWheel
          active={user.status === "active"}
          busy={busy}
          coins={user.coins}
          identityKey={user.id}
          unresolvedDay={unresolvedDay}
          onCheckIn={checkIn}
        />
      )}
    </div>
  );
}
