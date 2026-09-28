import { PageHeading, PageState } from "../../../../shared/ui/page-layout";

export default function Page() {
  return (
    <>
      <PageHeading title="支出管理" back="/admin" description="核對收據整理資料與處理狀態。" />
      <p className="section-label">功能規劃中 · 尚未開放</p>
      <PageState title="支出紀錄">依日期、幣別與資料狀態查詢尚未開放。</PageState>
      <PageState title="收據明細">
        商家、金額、憑證與付款方式將在此呈現；資料確認不代表核准或入帳。
      </PageState>
    </>
  );
}
