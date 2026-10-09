import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import type { ReactNode } from "react";
import LineSessionGate from "../../shared/browser/line-session-gate";

export default function Layout({ children }: { children: ReactNode }) {
  return <LineSessionGate liffId={lineMiniApp().liffId}>{children}</LineSessionGate>;
}
