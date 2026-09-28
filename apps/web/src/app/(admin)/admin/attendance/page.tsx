import { PageHeading, PageState } from "../../../../shared/ui/page-layout";

export default function Page() {
  return (
    <>
      <PageHeading title="出勤管理" back="/admin" description="核對上班、下班時間與未結束紀錄。" />
      <p className="section-label">功能規劃中 · 尚未開放</p>
      <PageState title="出勤紀錄">依日期、會員與紀錄狀態查詢尚未開放。</PageState>
      <PageState title="出勤明細">起訖時間、經過時間與每日分類將在此呈現，不作薪資計算。</PageState>
    </>
  );
}
