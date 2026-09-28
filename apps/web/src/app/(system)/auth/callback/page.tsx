"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../shared/browser/supabase-session";
export default function Callback() {
  const started = useRef(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const url = new URL(location.href),
          code = url.searchParams.get("code");
        history.replaceState(null, "", "/auth/callback");
        if (!code || url.searchParams.has("error")) throw new Error();
        const { error } = await (await supabase()).auth.exchangeCodeForSession(code);
        if (error) throw error;
        const saved = sessionStorage.getItem("loginReturn");
        sessionStorage.removeItem("loginReturn");
        const target = new URL(saved || "/settings", location.origin);
        location.replace(
          target.origin === location.origin &&
            ["/expenses", "/settings", "/google-link"].includes(target.pathname)
            ? target.pathname + target.search
            : "/settings",
        );
      } catch {
        setError("Google 登入未完成或連結已過期，請返回帳號設定重新登入。");
      }
    })();
  }, []);
  return (
    <main className="app-content">
      <h1>登入確認</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <Link href="/settings">返回帳號設定</Link>
        </>
      ) : (
        <p role="status">正在完成登入…</p>
      )}
    </main>
  );
}
