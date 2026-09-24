# Semantic modeling

## Canonical responsibility

本文件定義 **Bounded Context、Ubiquitous Language、Glossary、Semantic Boundary** 的關係。實際 cross-context term definition 只由 [Glossary](../050-glossary.md) 維護；owner-local vocabulary 留在 [Domain owners](../../010-domain-owners/README.md)。

## Bounded Context

Bounded Context 是一套 Domain Model、Ubiquitous Language 與 business authority 保持一致的語意邊界。

一個 Bounded Context 至少要能回答：

```text
Inside
→ 哪些 concept / state / invariant 在這裡有 canonical meaning？

Outside
→ 哪些 concept 明確不屬於這裡？

Authority
→ 衝突時誰決定合法結果？

Contract
→ 外部可以取得哪些 identity / query / command / fact？
```

它不是：

```text
1 Bounded Context = 1 package
1 Bounded Context = 1 schema
1 Bounded Context = 1 service
1 Bounded Context = 1 table
```

Context、Module、Data、Consistency boundary 可以高度對齊，但不具有機械等號。

## Ubiquitous Language

Ubiquitous Language 是 Context 內用來思考、討論與實作 Domain 的共同語言。

同一 Context 內應盡量形成：

```text
Business wording
=
Docs wording
=
Code wording
=
API / Event wording
=
Test wording
```

不是要求所有字串完全一致，而是同一 concept 不同位置不得偷偷改成另一個 meaning。

## Canonical vocabulary rule

```text
One concept
→ one canonical name
→ one authoritative definition
```

禁止用 import alias、export alias、wrapper 或 facade 掩蓋真正 naming / ownership 問題。名稱錯誤時優先修 owner、definition 或 export source。

## Glossary

Glossary 是 Ubiquitous Language 的 lookup artifact，不是 Ubiquitous Language 本身。

```text
Ubiquitous Language
= 活的語言系統

Glossary
= canonical definition / lookup surface
```

本 repository 採兩層：

| 層級 | Owner | 收什麼 |
| --- | --- | --- |
| Global / cross-context | [Cross-context glossary](../050-glossary.md) | 跨 Context 容易混淆、會影響 ownership 的詞 |
| Local | 各 [Domain owner](../../010-domain-owners/README.md) | owner-local state、command、event、value object、lifecycle vocabulary |

不要建立一份幾千詞的 enterprise dictionary。

## Same word, different model

同字不代表同 model。判斷時先問 Context：

```text
Membership @ Organization
≠ TeamMembership @ Team
≠ Employment @ Workforce

Ledger @ value facts
≠ Accounting General Ledger
```

若不同 Context 對同一詞使用不同 meaning，應：

1. 標明 Context；
2. 優先選更精確 canonical term；
3. 只有 external / legacy protocol 必須保留時，讓 translation 留在 adapter / ACL；
4. 不把 legacy literal 升格成第二個 current Domain model。

## Semantic modeling checklist

建立或修改重要 business concept 前確認：

- Definition 是什麼？
- 不是什麼？
- 哪個 Context 內有效？
- 誰擁有 definition？
- 哪些 verbs / states / events 是 canonical？
- 哪些 synonym 應禁止？
- 哪些 external names 必須 translation？
- 這個詞是否已出現在 [Glossary](../050-glossary.md) 或 owner 文件？

真正 current Context / owner 狀態以 [Domain map](../020-domain-map.md) 為準。
