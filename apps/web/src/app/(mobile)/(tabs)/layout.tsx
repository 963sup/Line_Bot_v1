import type { ReactNode } from "react";
import AppShell from "../../_shell/app-shell";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
