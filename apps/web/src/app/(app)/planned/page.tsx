import { PageHeading, PageState } from "../../../shared/ui/page-layout";
import AppShell from "../_shell/app-shell";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string | string[] }>;
}) {
  const { feature } = await searchParams;
  const title =
    feature === "news"
      ? "最新消息"
      : feature === "partners"
        ? "合作夥伴"
        : feature === "referrals"
          ? "夥伴推薦"
          : "功能準備中";
  return (
    <AppShell>
      <PageHeading title={title} />
      <PageState title="尚未開放">此功能仍在規劃中，目前不會提交或保存資料。</PageState>
    </AppShell>
  );
}
