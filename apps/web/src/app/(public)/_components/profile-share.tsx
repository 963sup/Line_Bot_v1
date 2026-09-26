"use client";

import { useState } from "react";

export default function ProfileShare() {
  const [notice, setNotice] = useState("");

  async function share() {
    const url = window.location.href;
    setNotice("");
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setNotice("已複製個人頁連結。");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("目前無法分享這個連結。");
    }
  }

  return (
    <span>
      <button type="button" className="secondary" onClick={() => void share()}>
        分享
      </button>
      {notice && <span role="status">{notice}</span>}
    </span>
  );
}
