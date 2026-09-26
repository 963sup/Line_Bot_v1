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

      <MemberAvatar liffId={liffId} />
    </div>
  );
}
