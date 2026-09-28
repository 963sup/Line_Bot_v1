"use client";

import Link from "next/link";
import MemberAvatar from "../../../modules/account/member-avatar";

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function HomeActions({ liffId }: { liffId: string }) {
  return (
    <div className="home-heading-actions">
      <Link
        className="home-heading-action"
        href="/search"
        aria-label="Search repositories"
        title="Search"
      >
        <svg {...iconProps}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
      </Link>

      <button
        type="button"
        className="home-heading-action"
        aria-label="Refresh Home"
        title="Refresh"
        onClick={() => window.location.reload()}
      >
        <svg {...iconProps}>
          <path d="M20 7v5h-5" />
          <path d="M19 12a7 7 0 1 0-1.2 4" />
        </svg>
      </button>

      <details className="home-create-menu">
        <summary className="home-heading-action" aria-label="Create" title="Create">
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </summary>
        <div className="home-create-popover">
          <Link href="/repositories/new">
            <span className="home-create-icon" aria-hidden="true">
              □
            </span>
            <span>
              <strong>New Repository</strong>
              <small>建立 private Repository</small>
            </span>
          </Link>
          <Link href="/repositories?intent=create-issue">
            <span className="home-create-icon" aria-hidden="true">
              ◎
            </span>
            <span>
              <strong>Create Issue</strong>
              <small>先選擇有 write 權限的 Repository</small>
            </span>
          </Link>
        </div>
      </details>

      <MemberAvatar liffId={liffId} />
    </div>
  );
}
