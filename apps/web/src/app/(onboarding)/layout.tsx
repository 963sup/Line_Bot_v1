import type { ReactNode } from "react";
import RouteAccess from "../../modules/account/route-access";
import EntryResolver from "../../shared/browser/entry-resolver";
import { lineMiniApp } from "../../shared/server/line-mini-app";
export default function Layout({ children }: { children: ReactNode }) {
  const liffId = lineMiniApp().liffId;
  return (
    <EntryResolver liffId={liffId}>
      <RouteAccess mode="onboarding" liffId={liffId}>
        {children}
      </RouteAccess>
    </EntryResolver>
  );
}

export const dynamic = "force-dynamic";
