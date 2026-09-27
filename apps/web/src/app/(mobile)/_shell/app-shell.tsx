import type { ReactNode } from "react";
import WorkNavigation from "./work-navigation";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <main id="main-content" className="app-content">
        {children}
      </main>
      <WorkNavigation />
    </div>
  );
}
