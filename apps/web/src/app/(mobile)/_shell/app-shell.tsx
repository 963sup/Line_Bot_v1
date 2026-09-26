import type { ReactNode } from "react";
import WorkNavigation from "./work-navigation";

export type AppShellNavigation = "tabs" | "secondary";

export default function AppShell({
  children,
  navigation = "tabs",
}: {
  children: ReactNode;
  navigation?: AppShellNavigation;
}) {
  return (
    <div className={"app-shell app-shell-" + navigation}>
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <main id="main-content" className="app-content">
        {children}
      </main>
      {navigation === "tabs" && <WorkNavigation />}
    </div>
  );
}
