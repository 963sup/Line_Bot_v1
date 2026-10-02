import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import AppShell from "../_shell/app-shell";
import ExpensePanel from "../../../modules/expense/panel";
import EntryResolver from "../../../shared/browser/entry-resolver";
export const dynamic = "force-dynamic";
export default function Page() {
  const liffId = lineMiniApp().liffId;
  return (
    <EntryResolver liffId={liffId}>
      <AppShell>
        <ExpensePanel liffId={liffId} />
      </AppShell>
    </EntryResolver>
  );
}
