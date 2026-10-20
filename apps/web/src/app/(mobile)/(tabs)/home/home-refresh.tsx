"use client";

export default function HomeRefresh() {
  return (
    <button
      type="button"
      className="home-heading-action"
      aria-label="Refresh Home"
      title="Refresh"
      onClick={() => window.location.reload()}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 1 0-1.2 4" />
      </svg>
    </button>
  );
}
