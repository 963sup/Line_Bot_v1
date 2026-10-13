import type { ReactNode } from "react";
import AppShell from "../../../_shell/app-shell";

export default function RepositoryLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
