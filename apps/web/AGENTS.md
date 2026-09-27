<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Web ownership routing

繼承 [apps](../AGENTS.md)。上方 Next.js managed block 保留；本節擁有專案工作入口。

- [app](src/app/AGENTS.md)：URL 與 framework delivery；沿 route group 讀其 local URL 契約。
- [modules](src/modules/AGENTS.md)：business-facing Web surface；沿 feature 讀 owner 與 FPT 對照。
- [shared](src/shared/AGENTS.md)：browser、presentation、server、observability、UI 機制；不收 business use case。
- `src` 不額外建立重複治理層；三個區域直接繼承本檔。route group、Web module、package owner、FPT category 是不同維度。
- 評估或補指引不隱含搬程式、改 URL、建立 package 或發布外部資源；實作必須依使用者授權範圍與已確認契約。
