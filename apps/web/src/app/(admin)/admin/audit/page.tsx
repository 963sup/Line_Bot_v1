import { PageHeading, PageState } from "../../../../shared/ui/page-layout";

export default function Page() {
  return (
    <>
      <PageHeading title="稽核紀錄" back="/admin" description="追查誰在何時對哪筆資料進行操作。" />
      <p className="section-label">功能規劃中 · 尚未開放</p>
      <PageState title="操作紀錄">依時間、操作者與業務類型查詢尚未開放。</PageState>
      <PageState title="操作明細">操作結果、原因與版本異動將在此呈現。</PageState>
    </>
  );
}
