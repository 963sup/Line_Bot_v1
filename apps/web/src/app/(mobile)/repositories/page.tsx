import Link from "next/link";
import RepositoryList from "../../../modules/repository/repository-list";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { PageHeading, PrimaryLink } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string | string[]; resource?: string | string[] }>;
}) {
  const { intent, resource } = await searchParams;
  const createIssue = intent === "create-issue";
  const manageAccess = intent === "manage-access";
  const manageSettings = intent === "manage-settings";
  const browseResource = resource === "issues" || resource === "discussions" ? resource : undefined;
  const choosingRepository =
    createIssue || manageAccess || manageSettings || Boolean(browseResource);

  return (
    <AppShell>
      <PageHeading
        title={choosingRepository ? "Choose Repository" : "Repositories"}
        description={
          createIssue
            ? "選擇具 write 或 admin capability 的 Repository，再建立該 Repository 擁有的 Issue。"
            : manageAccess
              ? "選擇具 admin capability 的 Repository，再管理 Direct User 與 Organization Team access。"
              : manageSettings
                ? "選擇具 admin capability 的 Repository，再設定地址與打卡範圍。"
                : browseResource === "issues"
                  ? "選擇 Repository，再進入該 Repository 的 canonical Issues surface。"
                  : browseResource === "discussions"
                    ? "選擇 Repository，再進入該 Repository 的 canonical Discussions surface。"
                    : undefined
        }
        actions={
          choosingRepository ? undefined : (
            <div className="collection-heading-actions">
              <Link href="/search" aria-label="Search repositories" title="Search repositories">
                <span aria-hidden="true">⌕</span>
              </Link>
              <Link href="/repositories/new" aria-label="New Repository" title="New Repository">
                <span aria-hidden="true">＋</span>
              </Link>
              <Link
                href="/repositories?intent=manage-access"
                aria-label="Manage repository access"
                title="Manage repository access"
              >
                <span aria-hidden="true">⋯</span>
              </Link>
            </div>
          )
        }
        back={choosingRepository ? "/home" : undefined}
      />
      {!choosingRepository && (
        <nav className="inline-actions" aria-label="Repository settings">
          <PrimaryLink href="/repositories?intent=manage-settings" tone="secondary">
            Manage Settings
          </PrimaryLink>
        </nav>
      )}
      <RepositoryList
        liffId={lineMiniApp().liffId}
        intent={
          createIssue
            ? "create-issue"
            : manageAccess
              ? "manage-access"
              : manageSettings
                ? "manage-settings"
                : browseResource === "issues"
                  ? "browse-issues"
                  : browseResource === "discussions"
                    ? "browse-discussions"
                    : undefined
        }
      />
    </AppShell>
  );
}
