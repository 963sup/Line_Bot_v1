import type { ReactNode } from "react";
import WorkNavigation from "./work-navigation";

type AppShellNavigation = "tabs" | "secondary";
type AppShellActiveHref = "/home" | "/notifications" | "/explore" | "/assistant";

export default function AppShell({
  children,
  navigation = "tabs",
  activeHref,
  className,
  contentClassName,
  showNavigation = true,
}: {
  children: ReactNode;
  navigation?: AppShellNavigation;
  activeHref?: AppShellActiveHref;
  className?: string;
  contentClassName?: string;
  showNavigation?: boolean;
}) {
  return (
    <div className={`app-shell app-shell-${navigation}${className ? ` ${className}` : ""}`}>
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <main
        id="main-content"
        className={`app-content${contentClassName ? ` ${contentClassName}` : ""}`}
      >
        {children}
      </main>
      {navigation === "tabs" && showNavigation && (
        <WorkNavigation {...(activeHref ? { activeHref } : {})} />
      )}
    </div>
  );
}
