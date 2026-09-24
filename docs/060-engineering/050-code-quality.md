# Code quality

工程品質的目標不是讓抽象層數增加，而是讓責任、修改原因與失敗模式更容易理解與驗證。Architecture quality trade-off 由 [Quality attributes](../020-architecture/060-quality-attributes.md) 擁有；本文件只描述 source change 的品質原則。

## 1. Decision order

遇到取捨時依序保護：Invariant correctness / security → 第一性原理 → 高手思維（benchmark + repository evidence）→ 根因 → Ownership / Source of Truth / Dependency direction → 奧卡姆剃刀 → Validation / Evidence → aesthetic symmetry。DDD / Hexagonal Architecture 用來維持責任與依賴方向，不以 layer 數、folder 對稱、interface 數量或 change size 判定品質。

## 2. Correctness before convenience

不得為了讓 UI、test 或 build 通過而放寬 authorization、transaction、replay protection、version、scope isolation、validation 或 recovery。錯誤應修在真正 owner，而不是用 fallback / alias / wrapper 掩蓋。

## 3. Single owner, single name

同一概念維持單一 canonical 名稱、public contract 與文件 owner。Consumer 需要 private implementation 時，先判斷 owner / surface 是否錯誤，不建立第二套同義型別或 compatibility facade。

## 4. Root cause before simplification

先找根因與真正 owner，再用奧卡姆剃刀判斷刪除、合併、簡化、重用或新增。不能因為『少改比較安全』就保留錯誤 ownership，也不能因為『大改比較完整』就擴張責任。下列理由單獨不足以建立抽象：

- 兩段 code 看起來相似。
- 未來可能換 provider。
- 未來可能有更多 module。
- 某個 pure function 被多處引用。
- 為了讓目錄看起來對稱。

## 5. Localize change

變更應落在真正 responsibility owner，並只擴張必要 public surface。跨 package / module 變更時先列 consumer、contract 與 dependency direction，避免順手重寫無關區域。

## 6. Root-cause dependency path and measured performance

Runtime 與 source dependency 先確認真正 owner、consumer need 與 failure semantics；如果 consumer 能直接使用 owner public contract，奧卡姆剃刀通常會刪除只做 delegation 的 service、manager、facade 或 wrapper。新增一個 hop 必須擁有不可刪的責任，例如 policy、translation、transaction / recovery、或真實 external technology boundary。

沒有量測 evidence 前，不因猜測加入 cache、batch、worker、parallel route、event bus 或 second store。發現 bottleneck 後先追 CPU / I/O / query / network / provider / render 的實際根因，再用奧卡姆剃刀決定刪除成本或新增元件；performance optimization 不得建立第二份 authority 或削弱 invariant。

## 7. Explicit technical debt

暫時性 drift 若會影響後續判斷，放到 `090-governance/040-gaps/` 或 `050-risks/` 並寫 completion condition / mitigation；不要讓 TODO、過期 README 或註解成為第二份架構 roadmap。已完成 gap 應蒸餾回 canonical owner 後刪除。

## 8. Evidence-based cleanup

Unused code / dependency finding 由 `deadcode` 等工具提供證據，但刪除前仍確認 public consumer、runtime entry、script 與 external use。Formatting、lint、typecheck、test、build 各自只證明自己的範圍。

## Review questions

每次變更至少能回答：

1. 真正 owner 是誰？
2. Consumer 真正需要的 contract 是什麼？
3. 能否刪除或合併，而不是新增？
4. 是否引入第二份 source of truth？
5. 是否改變 authorization / transaction / replay / isolation 語意？
6. 新增的每一層／每一跳擁有什麼不可刪責任？若答案只是轉傳，能否直接刪除？
7. 哪一種 evidence 才能證明這個改動？

## 相鄰 owner

- Architecture quality：[Quality attributes](../020-architecture/060-quality-attributes.md)
- Dependency rules：[Dependency rules](../020-architecture/040-dependency-rules.md)
- Validation：[Validation](040-validation.md)
- Gaps / risks：[Governance](../090-governance)
