# Assistant

Assistant 擁有產品內問答與草稿 orchestration，不擁有其他 module authorization、formal state 或 persistence write。AI provider/quota/SDK 由 [AI platform](../030-platform/060-ai.md) 擁有。

## Current implementation

`createAnswerAssistantQuestion` 與 `AnswerDependencies` 由 `@line-work/assistant` owner；Web 只用 public application surface。Horizontal application package 不再擁有 Assistant implementation。

Current results：empty→help；明確日期/時間→deterministic server `now()`；`建立Issue/Issue/待辦`→Issue draft；general generation 有 input/output bound/cooldown；provider empty/unavailable 與 valid text 分開。Issue draft 不建立正式 Issue。

## Conversation activation

LINE delivery 只提供可信 actor 與 conversation context；Assistant 決定是否把事件視為問答 intent。目前 1:1 `user` scope 的普通文字可直接進 Assistant，`group` / `room` 的普通文字保持沉默，只有 LINE 原生 self mention 才進 Assistant 問答。既有 explicit command 仍由各自 command handler 擁有，不因這個規則改成 generic chat。

Conversation scope 不是 authorization。Assistant 在回覆前仍要求既有 User qualification；跨 scope 不共享 durable agent memory，也不因群組、room 或 receiving bot destination 產生新的 business role。

## Issue draft boundary

Assistant 可以整理自然語言成 draft，但不能自行選可信 actor/assignee/publisher、取得 Organization TeamMembership/TeamMaintainer、直接寫 Repository owner，或把模型 output 當已核准 title/criteria/responsibility。正式 publish 仍由 Repository/Issue typed command、current User qualification、Organization Team scope/maintainer decision、request/version contract 決定。

## Authorization / failure

Delivery adapter 先完成來源驗證；任何後續 module command 仍由該 owner 重驗 Principal/User、scope、qualification/permission。`help`、`tooLong`、`cooldown`、`empty`、`unavailable` 是不同結果；provider timeout/quota/network failure 不自動產生或 retry 正式 business write。

## No premature agent domain

目前沒有 global workflow engine/tool registry/agent memory domain/generic approval/autonomous writer 的真實 requirement。只有 owner/authorization/recovery 明確、跨 module workflow 真的存在時才新增。

- [AI platform](../030-platform/060-ai.md)
- [Repository](080-repository.md)
- [Security](../050-security/README.md)
