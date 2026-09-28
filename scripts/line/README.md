# LINE operation scripts

本目錄只放 LINE provider operation adapter；LINE business/product rules 留在真正 application/package owner。

| Path | 用途 |
| --- | --- |
| `rich-menu/sync.ts` | Rich Menu preview/publish CLI adapter；載入 root env、轉交 command/target/token，輸出 operation result。 |

正式 Rich Menu 圖片位於 `assets/line/rich-menu/`。操作前遵守同層 `AGENTS.md`。
