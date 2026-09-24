import Link from "next/link";
import type { ReactNode } from "react";
import MemberAvatar from "../../../modules/account/member-avatar";
import WorkNavigation from "./work-navigation";

export default function AppShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: "repositories";
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <header className="app-shell-brand">
        <Link href="/home" className="shell-wordmark">
          <span aria-hidden="true">L</span>LINE 工作助手
        </Link>
        <MemberAvatar />
      </header>
      <main id="main-content" className="app-content">
        {children}
      </main>
      <WorkNavigation active={active} />
    </div>
  );
}
