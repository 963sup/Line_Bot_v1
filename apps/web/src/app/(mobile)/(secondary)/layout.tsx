import type { ReactNode } from "react";
import AppShell from "../../_shell/app-shell";

export default function SecondaryLayout({ children }: { children: ReactNode }) {
  return <AppShell navigation="secondary">{children}</AppShell>;
}
