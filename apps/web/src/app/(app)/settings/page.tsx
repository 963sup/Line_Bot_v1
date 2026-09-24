import MemberPanel from "../../../modules/account/panel";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { ActionRow, PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const miniApp = lineMiniApp();
  return (
    <AppShell>
      <PageHeading
        title="我的"
        description="個人資料、帳號設定、治理範圍與低頻工具集中在這裡。"
      />

      <SectionHeading title="帳號" />
      <div className="menu-group">
        <ActionRow
          href="/settings/profile"
          title="個人資料"
          description="顯示名稱、自我介紹、login 與 Profile visibility"
        />
        <ActionRow
          href="/settings/network"
          title="追蹤關係"
          description="管理 Following 與 Followers"
        />
        <ActionRow href="/settings/permissions" title="我的權限" description="查看功能與管理範圍" />
      </div>

      <SectionHeading
        title="範圍與治理"
        description="Enterprise 與 Organization 各自維持自己的治理責任。"
      />
      <div className="menu-group">
        <ActionRow
          href="/enterprises"
          title="企業"
          description="管理 Enterprise、成員與跨 Organization 治理"
        />
        <ActionRow
          href="/organizations"
          title="組織"
          description="管理 Organization、成員、邀請與 Owner"
        />
      </div>

      <SectionHeading
        title="組織協作"
        description="Organization Team 屬於 Organization scope，不與 Enterprise Team 混用。"
      />
      <div className="menu-group">
        <ActionRow
          href="/team"
          title="組織團隊"
          description="先選 Organization，再管理 Team 與 TeamMaintainer"
        />
      </div>

      <SectionHeading title="其他功能" description="低頻入口不再佔用工作台。" />
      <div className="menu-group">
        <ActionRow href="/diary" title="工作日誌" description="開啟既有外部工作日誌" />
        <ActionRow href="/expenses" title="費用" description="費用紀錄與既有操作" />
        <ActionRow href="/partners" title="合作夥伴" description="合作夥伴、消息與推薦" />
        <ActionRow href="/feedback" title="即時回饋" description="查看目前可用的回饋方式" />
        <ActionRow href="/admin" title="管理後台" description="具管理責任時使用的管理工作區" />
      </div>

      <MemberPanel liffId={miniApp.liffId} miniAppUrl={miniApp.url} />
    </AppShell>
  );
}
