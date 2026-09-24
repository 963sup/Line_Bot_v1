# @line-work/google-workspace

- 本 package 擁有 Google Workspace/Maps provider integration。
- 只供伺服器使用，不引入 Firebase、瀏覽器 token cache 或業務權限判定。呼叫者必須先核驗 identity、scope、resource owner 與 operation intent。
- 不接受任意 Google URL proxy、不自行選取其他帳號；OAuth connection lifecycle 與 Account 的 Google identity link 不是本 package 的資料 owner。
- 分頁完整才回傳成功；取消、逾時、部分失敗、write unknown-result、credential redaction 與 provider-specific semantics 必須維持既有行為。
- Maps credential 與 Workspace OAuth 分離；地址解析不等於 Attendance geofence proof。
