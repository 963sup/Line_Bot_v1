import { ActionRow, PageHeading, PageState } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default function RecordsPage() {
  return (
    <AppShell>
      <PageHeading title="工作紀錄" description="每一次完成，都有跡可循。" />
      <div className="section-label">出勤與回報</div>
      <ActionRow href="/attendance" title="今日出勤" description="查看今日打卡狀態" />
      <PageState title="歷史紀錄尚未開放">
        目前可以查看今日出勤。日誌填寫內容保留在原表單，這裡尚未提供紀錄查詢。
      </PageState>
    </AppShell>
  );
}
