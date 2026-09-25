import Link from "next/link";
import type { ReactNode } from "react";
import MemberAvatar from "../../../modules/account/member-avatar";
import WorkNavigation from "./work-navigation";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <header className="app-shell-brand">
        <Link href="/home" className="shell-wordmark" aria-label="LINE Work Home">
          <span aria-hidden="true">L</span>
          <span className="shell-wordmark-label">LINE Work</span>
        </Link>
        <MemberAvatar />
      </header>
      <main id="main-content" className="app-content">
        {children}
      </main>
      <WorkNavigation />
    </div>
  );
}
