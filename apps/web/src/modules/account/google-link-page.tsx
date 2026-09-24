"use client";
import { useEffect, useRef, useState } from "react";
import { googleLogin, sessionToken } from "../../shared/browser/supabase-session";
import { miniAppEntryUrl } from "../../shared/presentation/entry-route";

/** 此頁不載入 LIFF：Google 登入只提交候選帳號，原 LINE 會員才有確認權。 */
export default function GoogleLinkPage({ miniAppUrl }: { miniAppUrl: string }) {
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = new URLSearchParams(location.hash.slice(1)).get("request");
    // fragment 不會送到伺服器；只在這個外部分頁保留，OAuth 往返不傳遞 LINE token。
    history.replaceState(null, "", location.pathname + location.search);
    if (fragment && /^[A-Za-z0-9_-]{43}$/.test(fragment))
      sessionStorage.setItem("googleLinkRequest", fragment);
    if (!sessionStorage.getItem("googleLinkRequest")) {
      setError("綁定連結已失效，請回會員中心重新開始。");
      return;
    }
    setReady(true);
    if (new URLSearchParams(location.search).get("complete") === "1") void submit();
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const token = sessionStorage.getItem("googleLinkRequest") ?? "";
      const response = await fetch("/api/membership/google-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Google-Link": token,
          Authorization: `Bearer ${await sessionToken()}`,
        },
        body: JSON.stringify({ action: "stage" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      sessionStorage.removeItem("googleLinkRequest");
      history.replaceState(null, "", "/google-link");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google 登入未完成，請重試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="app-content">
      <h1>綁定 Google</h1>
      <p>Google 為選填，不要求 Gmail 或 Drive 權限。</p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">正在處理 Google 帳號…</p>}
      {done ? (
        <p role="status">Google 帳號已備妥。請返回 LINE 帳號設定核對帳號並確認綁定。</p>
      ) : (
        ready && (
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void googleLogin().catch(() => {
                setError("Google 登入暫不可用。");
                setBusy(false);
              });
            }}
          >
            選擇 Google 帳號
          </button>
        )
      )}
      <p>
        <a href={miniAppEntryUrl(miniAppUrl, "membership")}>返回 LINE 帳號設定</a>
      </p>
    </main>
  );
}
