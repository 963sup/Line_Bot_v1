import type { ReactNode } from "react";
import WorkNavigation from "../../_shell/work-navigation";

export type AppShellNavigation = "tabs" | "secondary";
export type AppShellActiveHref = "/home" | "/notifications" | "/explore" | "/assistant";

export default function AppShell({
  children,
  navigation = "tabs",
  activeHref,
}: {
  children: ReactNode;
  navigation?: AppShellNavigation;
  activeHref?: AppShellActiveHref;
}) {
  return (
    <div className={"app-shell app-shell-" + navigation}>
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <main id="main-content" className="app-content">
        {children}
      </main>
      {navigation === "tabs" && <WorkNavigation activeHref={activeHref} />}
    </div>
  );
}
