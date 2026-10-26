# Request for Comments（RFC）

本目錄是尚未採用的設計提案入口。RFC 用來釐清一個有真實 consumer、activation 問題或未決取捨的未來方向；它不是 current product、architecture、schema 或 authorization truth。

當提案被採用且仍有未來決策價值時，將理由與取捨蒸餾到 `../decisions/` 的 ADR。當能力實際落地時，durable truth 必須移至對應的 Owner contract、`architecture/*.json`、schema、source 與 tests；過時提案應刪除而非保留平行規格。

## 建議內容

每份 RFC 以描述性檔名命名，並說明：

1. 問題、真實 consumer 與預期結果。
2. 提案、非目標及受影響的 Owner／契約。
3. authorization、isolation、concurrency、replay、recovery 等不可弱化的 invariant。
4. 已考慮但未採用的替代方案。
5. 最小驗證、採用條件，以及採用後應移入的 canonical truth。

不使用流水號建立第二套歷史排序；Git history 保存時間順序。

## 目前提案

- [Document owner skeleton — Step 1（減法邊界與停止條件）](document-owner-skeleton-reduction-step-1.md)
- [Document owner skeleton — Step 2（Integration / Port / Composition）](document-owner-skeleton-reduction-step-2.md)
- [Document owner skeleton — Step 3（File → Intelligence → Vercel AI Gateway / 結構化候選）](document-owner-skeleton-reduction-step-3.md)
- [Document owner skeleton — Step 4（Contract 驗證與人工確認）](document-owner-skeleton-reduction-step-4.md)
- [Document owner skeleton — Step 5（Contract → Content 確定性全量轉換）](document-owner-skeleton-reduction-step-5.md)
- [Document owner skeleton — Step 6（Content → WBS 與正式 Baseline）](document-owner-skeleton-reduction-step-6.md)
- [Document owner skeleton — Step 7（E2E／反向證據／失敗恢復）](document-owner-skeleton-reduction-step-7.md)
- [Domain target](domain-target.md)
- [Data target](data-target.md)
- [Security target](security-target.md)
- [Mobile presentation target](mobile-presentation-target.md)
