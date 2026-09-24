import ExpensePanel from "../../../modules/expense/panel";
import EntryResolver from "../../../shared/browser/entry-resolver";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import AppShell from "../_shell/app-shell";
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
