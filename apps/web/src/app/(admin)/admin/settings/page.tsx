import { PageHeading, PageState } from "../../../../shared/ui/page-layout";

export default function Page() {
  return (
    <>
      <PageHeading title="系統設定" back="/admin" description="檢視服務設定與整合狀態。" />
      <p className="section-label">功能規劃中 · 尚未開放</p>
      <PageState title="服務與整合">LINE、資料服務與業務入口的設定檢視尚未開放。</PageState>
      <PageState title="背景作業">最近執行結果尚未提供，服務運作狀態未檢查。</PageState>
    </>
  );
}
