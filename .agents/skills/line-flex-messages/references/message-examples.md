# Flex 與 Quick Reply 範例

核對日期：2026-09-09。以下為獨立撰寫的教學資料，不是正式紀錄或新增產品流程；使用時沿用既有 presenter、SDK 型別與後端授權。

## 收據摘要

這是完整 Flex message；Simulator 匯入 `contents`。正式內容由可信資料產生，`altText` 避免暴露私密金額或商家，確認不代表入帳。

```json
{
  "type": "flex",
  "altText": "示例：收據待核對",
  "contents": {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "spacing": "md",
      "contents": [
        { "type": "text", "text": "示例：收據待核對", "weight": "bold", "wrap": true },
        { "type": "text", "text": "示例商家・NT$ 120", "wrap": true },
        { "type": "text", "text": "請至操作頁核對原始單據；本卡片不代表已入帳。", "size": "sm", "wrap": true }
      ]
    }
  }
}
```

需要操作按鈕時，由既有入口產生器提供正式 URI，不能硬編假 expense ID、憑證或任意返回網址。[Flex 官方指南](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)。

## Quick Reply

Quick Reply 放在 message 外層，不放 bubble 內。此例示範使用者明確選擇傳送位置，不是出勤定位核驗或自動打卡；沒有相應 handler 就不發布。

```json
{
  "type": "text",
  "text": "示例：若要分享位置，請點選下方按鈕。",
  "quickReply": {
    "items": [
      { "type": "action", "action": { "type": "location", "label": "分享位置" } }
    ]
  }
}
```

location／camera 等 action 的可用位置與裝置限制依 [Quick Reply 官方指南](https://developers.line.biz/en/docs/messaging-api/using-quick-reply/) 核對；不要移到 Flex button。按鈕可能消失，不能作唯一的持久功能入口。

## 採用與驗證

- 先確認情境有用，再替換示例內容；用安裝版本的 SDK message 型別核對，不抄其他版本的 import。
- JSON 解析、SDK 型別、LINE validate、Simulator 與手機顯示是不同證據；正式採用時按 [技能驗證流程](../SKILL.md#驗證與交付) 分別記錄。
- 請求發送只由既有 adapter 負責，不因範例新增 fetch wrapper 或 Express Webhook。

範例選題參考 [TypeScript／Flex 技能](https://github.com/takzobye/line-messaging-api-skills/blob/main/line-messaging-api/SKILL.md)，結構依官方文件重新撰寫；未匯入上游 SDK 或 Webhook 程式。
