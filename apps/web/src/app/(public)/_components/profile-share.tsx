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
    <span className="profile-share-control">
      <button
        type="button"
        className="profile-settings-action secondary"
        aria-label="分享 Profile"
        title="分享"
        onClick={() => void share()}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
        </svg>
      </button>
      {notice && (
        <span className="profile-share-notice" role="status">
          {notice}
        </span>
      )}
    </span>
  );
}
