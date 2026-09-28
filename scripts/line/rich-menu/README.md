# Rich Menu operation

| Script | 用途 |
| --- | --- |
| `sync.ts` | `pnpm line:rich-menu [preview|publish] [target]` execution adapter。載入 root environment，把 command/target/repository root/LINE token 交給 canonical Web Rich Menu operator，輸出 JSON result。 |

此 script 不擁有 Rich Menu definition、desired state 或 publication transaction；只負責 argv/env/output adapter。
