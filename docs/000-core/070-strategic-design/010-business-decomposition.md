# Business decomposition

## Canonical responsibility

本文件只定義從 **Business Reality → Problem Space → Domain → Subdomain → Core / Supporting / Generic** 的分解規則。Current subdomain classification 由 [Domain map](../020-domain-map.md) 保存；future classification 只在 [Governance](../../090-governance/README.md) 保存。

## Business Reality

Business Reality 是不依賴目前軟體形狀而存在的現實責任、限制與價值交換。它回答：

- 誰在現實世界承擔責任？
- 哪些結果必須成立？
- 哪些關係、時間、權限或價值不能靠 UI 假裝？
- 如果拿掉 Next.js、Supabase、LINE、package 與 table，什麼問題仍存在？

Business Reality 不是 route、screen、table、SDK 或 provider capability。

```text
Reality
↓
需要完成的結果
↓
需要維持的責任 / 約束
↓
才進入 Domain modeling
```

對本產品，GitHub FPT 是 semantic benchmark，但只借鏡清楚的 concept boundary、naming、responsibility、relationship 與 information architecture；不引入 Git / Source Code Management / code hosting 語意。Canonical product terms 只由 [Cross-context glossary](../050-glossary.md) 定義，current relationship constraints 只由 [Domain map](../020-domain-map.md) 保存，本文件不建立第三份 semantic definition。

使用外部 benchmark 時遵守：

1. **先抽責任，不抄 API shape**：GraphQL object／field 只能作 evidence，不能直接變成本產品 Entity、table 或 package。
2. **保留 ownership separation**：identity、membership／invitation、permission、container、planning、work、conversation 等 responsibility 若在 benchmark 中可獨立演化，先判斷本地是否也有真實不同 owner。
3. **Local authority 優先**：GitHub concept 與本產品 canonical owner 衝突時，以本產品 business truth 為準；差異應明確記錄，不用 alias 假裝一致。
4. **沒有 consumer 不落地**：semantic benchmark 可以先形成 glossary／boundary constraint，但沒有真實 lifecycle、consumer、public contract 或 persisted fact 時，不新增 package、schema 或 abstraction。
5. **排除產品特定噪音**：Git／SCM／code hosting／software delivery 專屬 semantics 不得因來源成熟就進入本產品 Ubiquitous Language。

這些規則只決定如何從 benchmark 提取價值；是否已有 runtime implementation 必須另外查 current owner / Governance evidence。

## Problem Space

Problem Space 描述「要解決什麼」，不是「要怎麼實作」。

```text
Problem Space
≠ Solution Space

Employment 是否有效？
= business problem

用哪張 table / API / class 判斷？
= solution decision
```

建立新 package、schema、service 之前，先寫出不含技術名稱的 problem statement。若拿掉 implementation 名稱後問題也消失，通常還沒有找到真正的 business problem。

## Domain

Domain 是整體業務問題世界與其規則集合。Domain 名稱應描述 business responsibility，而不是產品 UI 或 provider。

目前 current business world 的總覽由 [Domain map](../020-domain-map.md) 擁有。本文件不重複 owner 清單。

## Subdomain

Subdomain 是 Problem Space 中可以獨立描述價值、語言、規則與變化原因的部分。它不是 package、service 或 table 的同義詞。

判斷 Subdomain 時至少問：

1. 它解的是不是不同 business problem？
2. 是否有不同 language / lifecycle / invariant？
3. 是否有不同 authority / decision owner？
4. 是否有不同 consumer 或變化原因？
5. 分開後是否降低理解與修改成本，而不是只讓 tree 看起來整齊？

沒有新的 business responsibility，就不因 folder symmetry 建新的 Subdomain。

## Core / Supporting / Generic

三者是 **strategic investment classification**，不是 security level、layer 或 deployment topology。

| 類型 | 判斷 | 預設投入 |
| --- | --- | --- |
| Core | 直接承載產品差異化價值，失真會傷害產品核心 | 深度建模、明確 invariant、強 ownership |
| Supporting | 業務必要，支援 Core，但本身不是主要差異化來源 | 足夠精確的模型與 contract |
| Generic | 可由成熟通用方案承接，沒有值得自行維護的特殊語意 | Buy / reuse / provider first |

「很多程式碼」「很複雜」「很安全」都不足以證明它是 Core。

## Stop rule

```text
繼續往下拆
如果不會改變：
- owner
- language
- invariant
- boundary
- investment decision

→ 停止
```

Subdomain classification 一旦要落到 current product，回 [Domain map](../020-domain-map.md)；不要在本文件維護第二份 current owner matrix。
