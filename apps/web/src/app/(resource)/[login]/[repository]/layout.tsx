import type { ReactNode } from "react";
import AppShell from "../../../(mobile)/_shell/app-shell";

export default function RepositoryLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
