# 群組、room 與使用者同意

核對日期：2026-09-07。

## 聊天範圍

依 [Group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/) 核對 Allow bot to join group chats；預設關閉，且同時只能有一個 LINE Official Account 在群組／多人聊天室。舊 room 仍可能送事件，不因新版本改用 group 就移除 room 相容處理。

使用已驗簽事件的 `source.type`、`groupId`／`roomId` 分隔聊天，`userId` 識別動作者。Bot 的 join／leave 與人的 memberJoined／memberLeft 是不同生命週期，不能互相代替。

群組／room push 的 `to` 是 groupId／roomId，所有群友都看得到；multicast 不能用來向多個群組或 room 發送。取得名單、個人 profile、摘要及離開聊天室各有 endpoint，僅呼叫需求所需項目；由 [API reference](https://developers.line.biz/en/reference/messaging-api/) 重查帳號資格、分頁與好友條件，不把人數等同可取得完整 userId 名單。

## 同意與身分缺漏

[User consent](https://developers.line.biz/en/docs/messaging-api/user-consent/) 指 LINE profile 存取同意，與本產品會員及 LINE Login scope 不同。未同意可能使事件 source、mention 或名單缺少使用者資訊；部分舊 PC-only 帳號可能仍加好友、邀 bot，但沒有 profile 同意。

缺少 userId 時保持未識別狀態，按既有契約跳過需要身分的業務；不能用顯示名稱、groupId 或 mention 目標補成動作者。Profile 取得失敗也可能是封鎖、未加好友、bot 被移出或使用者離群，不能單憑失敗就推論未同意。

本專案依 [Account](../../../../docs/010-domain-owners/010-account.md) 核驗 active membership／owner；群友、官方帳號訂閱會員與本產品會員不是同一授權。原生 mention 依事件 mention 結構核對 bot，不以文字剛好含 @名稱 當觸發。

## 任務相關驗證

以不同群組同一使用者、同群不同使用者、舊 room、缺少 userId、profile 失敗及 bot 離群驗證受影響流程。預期是保留 scope／owner 隔離、不錯認身分、不把私人結果傳到整群；僅新增說明文件時不需要真實發送或變更群組設定。
