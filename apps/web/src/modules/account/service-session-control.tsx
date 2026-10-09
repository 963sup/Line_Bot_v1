"use client";

import { useEffect, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { SessionBlockedError } from "../../shared/browser/line-service-session";

type Status = "checking" | "signed-in" | "signed-out" | "sign-out-failed" | "unavailable";

export default function ServiceSessionControl({ liffId }: { liffId: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = liffClient.onSessionBlocked((reason) => {
      setStatus("signed-out");
      setMessage(
        reason === "signed-out" ? "你已登出此服務。" : "登入狀態已在其他分頁更新，請重新登入。",
      );
    });
    void liffClient
      .ensureSession(liffId)
      .then((session) => {
        if (!active) return;
        setStatus(session ? "signed-in" : "unavailable");
        if (!session) setMessage("目前無法取得 LINE 登入資訊，請從 LINE MINI App 開啟。");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof SessionBlockedError) {
          setStatus("signed-out");
          setMessage(error.message);
          return;
        }
        setStatus("unavailable");
        setMessage(error instanceof Error ? error.message : "登入狀態讀取失敗，請重試。");
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [liffId]);

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      await liffClient.endSession();
      setStatus("signed-out");
      setMessage("你已登出此服務。LINE 帳號本身仍保持登入。");
    } catch (error) {
      setStatus("sign-out-failed");
      setMessage(error instanceof Error ? error.message : "登出失敗，請重試。");
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    setMessage("");
    try {
      const session = await liffClient.startSession(liffId);
      if (!session) {
        setStatus("unavailable");
        setMessage("目前無法取得 LINE 登入資訊，請從 LINE MINI App 開啟。");
        return;
      }
      setStatus("signed-in");
      setMessage("已重新登入此服務。");
    } catch (error) {
      setStatus(error instanceof SessionBlockedError ? "signed-out" : "unavailable");
      setMessage(error instanceof Error ? error.message : "登入失敗，請重試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="service-session-title">
      <h2 id="service-session-title">登入狀態</h2>
      <p>這會登出本服務，不會登出你的 LINE 帳號。</p>
      <p role="status">
        {status === "checking"
          ? "正在確認服務登入狀態…"
          : status === "signed-in"
            ? "目前已登入此服務。"
            : status === "signed-out"
              ? "目前已登出此服務。"
              : status === "sign-out-failed"
                ? "此分頁已停止使用服務，但伺服器撤銷尚未確認。"
                : "目前無法確認服務登入狀態。"}
      </p>
      {message && <p role="alert">{message}</p>}
      {status === "signed-in" || status === "sign-out-failed" ? (
        <button type="button" className="secondary" disabled={busy} onClick={() => void signOut()}>
          {busy ? "正在登出…" : "登出此服務"}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || status === "checking"}
          onClick={() => void signIn()}
        >
          {busy ? "正在登入…" : "使用 LINE 重新登入"}
        </button>
      )}
    </section>
  );
}
