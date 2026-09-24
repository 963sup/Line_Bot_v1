# Identity mapping

## Current truth

Current human business identity 是 product-owned `User`，stable identity = `UserId = AccountId(kind=USER)`。LINE／Google identity 只透過 `app_private.user_identities(provider, subject, user_id)` 綁定；Supabase `auth.users.id` 只作 optional technical principal，不能取代 UserId。

```text
LINE proof ─────┐
                │
                ▼
              User
         internal AccountId
                ▲
                │
Google proof ───┘
```

## Identity flow

Product identity 不以 provider 串成鏈；LINE、Google、Supabase Auth 都只是 proof / technical identity source，真正的 business identity 是 Account root 的 **User** facet。

```text
LINE proof ─────┐
                │
                ▼
              User
         internal AccountId
                ▲
                │
Google proof ───┘
```

LINE MINI App 的完整方向：

```text
LINE MINI App
   │
   ├─ LINE identity proof
   │      provider = LINE
   │      subject  = LINE user id
   │
   ▼
User
   │
   └─ Google OAuth
          ↓
      Supabase Auth
          ↓
      Google subject / Supabase auth user id
```

Persisted model：

```text
accounts
├─ User
│  ├─ LINE identity  (provider namespace + immutable subject)
│  └─ Google identity(provider namespace + immutable subject)
├─ Organization
└─ Enterprise
```

Provider proof 經 Integration/Security 驗證後，mapping 指向同一個 `UserId`（同值 `AccountId`）：

```text
verified provider / issuer-or-channel namespace + subject
        ↓ persisted binding
UserId = AccountId(kind=USER)
```

Legacy Member → current User 的已保留 identity 必須維持同一 opaque text AccountId；不能靠 email merge、重新配 UUID 或另造 mapping ID。Account root/facet 使用同 key；provider subject 不是 UserId、EmploymentId、OrganizationId，也不是自動可信 Principal。

[Account target rules](../010-domain-owners/README.md) 擁有 link confirmation 與 human lifecycle；Data 擁有 binding representation；Integration/Security 擁有 proof 驗證。不存在第二個 link writer。

LINE bot userId／webhook `destination` 是 signed provider context，不建立 Account-owned product identity。Human webhook `source.userId` 仍是 external subject，必須經既有 User provider mapping；receiving destination 與 human actor 不得混用。

## Provider separation

LINEsubject、GoogleOAuthsubject、SupabaseAuthuserID是不同namespace，不能因看起來都叫userId就互換。首個cutover保留existingproviderencoding/channel規則及cardinality；若將issuer/channel顯式拆欄位，要先證明能無損轉換與防collision，不能生成新duplicatebinding。

Optionalauth_user_id是technicalbinding，不是第二個businessidentity。LINE-onlyUser不要求存在Authuser；Googlelink不等於GoogleWorkspaceAPIconnection/scopes。搬binding位置時原writer必須退出，不能同時維護欄位與relation兩份可獨立寫的truth。

## Trust and lifecycle

Clientmember/accountID、profile、email、editablemetadata、decodedtoken不是proof。Server驗provider validity/issuer/channel/subject後讀mapping，重新核驗currentqualification與必要Principal/delegation/permissions/scope。

Googlecandidate需回原LINEUser明確確認；request短效、one-time、qualificationversionbound，新request使舊request失效。Callbacksuccess不是已授權link/Organizationrole。

Link/unlink不轉移historicalowner、不恢復suspended帳号，不以新provider重建Wallet/Ledger/history。Providercredentials/session不保存成businessidentityrecord；Authlink成功不繞過currentbanned/qualificationchecks。

## Queries / exposure / acceptance

HTTPprojection只回usecase必要ID/summary，admin可看帳號不表示能看rawsubject/token。Concurrentregister/link、sameprovidercollision、wrongchannel/issuer、sameemaildifferentperson、expiredcandidate、revokedqualification、same-requestreadback與LINE-only都需tests。

[Target data model](../090-governance/020-proposals/030-data-target.md)、[Schema foundation](../090-governance/020-proposals/030-data-target.md)、[Authorization](../050-security/030-authorization.md)、[LINE verification](../030-platform/010-line.md) 各保留自己的authority。Current source 的 durable provider mapping 只服務實際 human User identity consumer；remote catalog、deployment 與 device evidence 仍需各自 readback，不能只靠本文件宣稱外部環境已切換。
