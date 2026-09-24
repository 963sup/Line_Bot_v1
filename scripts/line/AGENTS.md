# LINE operator scripts

- 本目錄只擁有 LINE provider 的本機／CI 操作 orchestration，不承擔 Attendance、Team、Repository、Project、Notifications 或其他產品業務規則。
- 產品 LINE protocol／client implementation 仍由 `@line-work/line-channel` 擁有；script 只組合既有 public/runtime capability。
- Rich Menu 唯一操作入口是根 `package.json` 的 `pnpm line:rich-menu`；`scripts/line/rich-menu/sync.ts` 只擁有 env／argv／結果輸出，definition／desired state／publication transaction 由 Web Rich Menu module 擁有；正式素材位於 `assets/line/rich-menu/`，不得複製到 script 目錄。
- `preview` 只讀 repository 素材與設定；`preflight` 只做 LINE readback；`publish` 在單一 process 內完成 LINE preflight／create／upload／activate／readback。Rich Menu desired-state source 合併到 `main` 後，由 GitHub `Release` 在同 SHA repository validation 與 Vercel deployment 成功後自動 publish；不納入一般 `check`／`validate`，也不由非 main branch mutation remote。
- Rich Menu publication 不讀 Attendance／Supabase business state；個人 menu binding 由 Attendance owner 維護。
- MINI App Developing／Review／Published permanent URL 是 public source-owned identity；current stage 由 source 明確指定，不能從 Vercel／branch 推導。Rich Menu 與 Web 使用同一 current stage，LIFF ID／Login Channel ID 從同一 URL 派生，不新增重複 env。
- 不提交 token、channel secret 或遠端 ID；publication 不建立本地 receipt，remote readback 與 workflow log 是操作證據。
- 修改 Rich Menu script、素材路徑或發布流程時，同步更新 `.github/workflows/release.yml`、LINE integration canonical doc、相關 tests 與 `scripts/README.md`。
