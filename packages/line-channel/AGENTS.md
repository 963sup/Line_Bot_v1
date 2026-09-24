# @line-work/line-channel

- 本 package 擁有 LINE provider integration implementation。
- `adapters/identity` 擁有 LINE user proof 驗證；`adapters/messaging` 擁有 Messaging API／webhook／Rich Menu；`adapters/mini-app/browser` 擁有 browser-safe LIFF client。
- Browser surface 必須與 server credential/SDK graph 分離。
- 本 integration 不擁有 User qualification、Attendance、Expense、Team 或其他 business state；provider proof 必須交給真正 owner 再做 qualification／授權。
- LINE webhook `destination` 是簽章 payload 內的 receiving-bot provider metadata；它不是 credential、Principal、Permission 或第二套 product identity。正確簽章與合法 envelope 已足以建立 transport trust，不得為 admission 再查 business persistence。
- Human LINE User identity 仍使用 provider namespace + subject mapping；actual command 由 `source.userId` 解析 User，之後再做 owner qualification／authorization。Transport verification 與 business authorization 必須保持不同 failure boundary。
- Rich Menu product definition／desired state／publication transaction 由 Web Rich Menu module 擁有，operator entry 位於 `scripts/line/rich-menu/sync.ts`，正式圖片位於 `assets/line/rich-menu/`；本 package 只擁有 LINE Messaging API protocol/client，不反向擁有產品 navigation 或 publication policy。
- 修改需保留既有 endpoint、signature/raw-body、retry key、payload bounds、credential redaction、Rich Menu readback 與 LIFF continuation semantics。
- LINE channel 是 GitHub-like owner platform 的 integration category，不是整個產品的 owner；protocol schema、identity proof、Messaging API 與 LIFF transport 屬本 package，Account、navigation、Team、Attendance 等 capability 仍由各自 owner 擁有。
- Provider payload／schema version 只描述 integration contract；不得把 provider accepted、HTTP success 或 schema-valid response 當成產品 capability 已生效。遠端 mutation 必須保留 target、request identity、precondition、readback 與 evidence。
- Integration 的 generated/reference data 若存在，必須依 provider/capability/version 分片並可由 canonical source 重建；不得讓 provider schema、preview 或 deprecated field 直接成為 business authorization 或 navigation authority。
