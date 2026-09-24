import {
  ActionRow,
  PageHeading,
  PrimaryLink,
  SectionHeading,
} from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default function Page() {
  return (
    <AppShell>
      <PageHeading
        title="工作台"
        description="只處理現在要做與需要注意的工作；管理與低頻工具不再堆在首頁。"
      />

      <section className="home-primary" aria-labelledby="home-primary-title">
        <div>
          <p className="home-primary-kicker">現在</p>
          <h2 id="home-primary-title">先處理當下工作</h2>
          <p>高頻操作留在工作台；探索、儲存庫、通知與個人入口使用全域導覽。</p>
        </div>
        <div className="home-primary-actions">
          <PrimaryLink href="/attendance">開啟出勤</PrimaryLink>
          <PrimaryLink href="/repositories" tone="secondary">
            查看儲存庫
          </PrimaryLink>
        </div>
      </section>

      <SectionHeading title="需要注意" description="只保留需要回來處理或確認的入口。" />
      <div className="home-action-grid">
        <ActionRow href="/notifications" title="通知" description="查看需要注意的最新狀態" />
        <ActionRow href="/history" title="工作紀錄" description="回看已完成的出勤與工作紀錄" />
      </div>
    </AppShell>
  );
}
