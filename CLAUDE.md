# Invoice Portal (請求書作成ポータル)

請求書の作成・発行・管理ポータル。**capex-budget-control を原型に作った骨格**
(2026-11-16)。macOS Tahoe デザイン、Next.js 16 + Dataverse + Azure AD (MSAL)。

## 状態: 原型 (prototype)

動くもの: サインイン (MSAL) / 登録ユーザーの判定 / ロール権限表 / User Management /
Role Permissions / Setup (User Profile テーブルのみ) / ヘッダー・サイドレール / ダーク
モード / 招待メール。
**`/invoices` (段階 1, 2026-11-16)**: 立替費用 Excel (シート `請求_出向者立替費用`) をアップロード →
表題 (INVOICE / DEBIT NOTE) を行ごとに選ぶ → 請求書 PDF を作る。部品は `lib/invoice/` (`claim-sheet` =
Excel 読込、`build-pdf` = PDF、`invoice-number` = `HYM1AC{会計年度}-{連番}`、会計年度は 4/1 始まり)。
**請求書自体はまだ何も保存しない**。連番 (3 桁、`-182`) は手入力。
**取引先マスタ**: Admin > Customers (`/admin/customers`, 行 `admin-customers`) で登録し、Dataverse の `hi_invoicecustomer`
(Admin > Setup > Invoice Customer table で作る。組織所有) に入る。`code` が Excel の「Claim to」と一致する鍵で、重複不可。
表が空のときは `customers-seed.ts` の既知 3 社 (HLAM / HOGV / HOMS-J) をボタンで投入できる。
**未実装**: 請求書・明細の Dataverse テーブル、PDF とデータの保存、連番の自動採番。

## Tech Stack

Next.js 16.2.9 (App Router) · React 19.2.4 · Tailwind 4 · Microsoft Dataverse ·
Azure AD / MSAL.js · Lucide · SWR · isomorphic-dompurify · jsPDF + autotable / ExcelJS
(請求書 PDF・Excel 用に残してある。使うまでは `await import()` のみ)。
`src/proxy.ts` が `/api/*` の前で Dataverse を呼ぶ (未登録は 403)。

## 新しい環境で最初にやること

1. **Azure AD に Invoice Portal 用アプリを新規登録** - CAPEX のクライアント ID は流用しない。
   リダイレクト URI は **SPA**、`{NEXT_PUBLIC_APP_URL}/auth/callback`。
2. `.env.example` を `.env.local` にコピーして埋める (`.env*` は git 管理外)。
3. Dataverse の接続先を決める。**CAPEX と同じ環境を共有するなら `hi_userprofiles` が
   すでにある** - 別環境なら Admin > Setup > User Profile table を実行。
4. `npm install && npm run dev`。

## Entra アプリ登録の状況 (2026-11-16)

- Invoice Portal 用アプリ登録済み (HOYA Corporation テナント、シングルテナント)。
  Client ID `a20ad64f-24cb-4c99-a6c2-320611d971f8` / Tenant ID `bf781f77-403a-41b0-bc8d-aef742fcc54e`。
  SPA リダイレクト URI は `http://localhost:3000/auth/callback` のみ - **本番 URL は未登録**
  (決めたら SPA に追加し、`NEXT_PUBLIC_APP_URL` も合わせる)。
- Dataverse 接続先: `https://md-mgd-env3-payg.crm5.dynamics.com` (CAPEX と同じ環境かは未確認)。
- **API permissions (すべて Delegated)**: Dynamics CRM `user_impersonation` /
  Graph `User.Read`・`User.Read.All`・`Mail.Send`。コードが使う Graph 呼び出しは
  `GET /users` (担当者検索) と `POST /me/sendMail` (招待・通知メール) だけで、これで足りる。
  `User.ReadBasic.All` は `msal-config.ts` に定義があるだけで未使用。
  `AZURE_CLIENT_SECRET` は src で未使用 (Application 権限も不要)。
- **`User.Read.All` は管理者同意が必要**で、本人は「Approval required」になる。**IT 管理者に
  承認を依頼中。承認されるまでサインインの動作確認はできない。**
- 将来 PDF を OneDrive / SharePoint に保存する、Teams 通知する等を決めたら
  `Files.ReadWrite` / `Sites.Selected` / `Mail.ReadWrite` などを個別に追加依頼する
  (追加するとユーザーは再同意が必要)。

## 原型から持ち越したもの (整理の候補)

- **`hi_` プレフィックス・`hi_userprofiles`・`hi_appsettings`** をそのまま使う。
  請求書用の新テーブルも `hi_` に揃えるか、別プレフィックスにするか決める。
- **Ringi preview (試用メンバー機能)**: `lib/auth/ringi-preview`, `lib/settings/ringi-preview`,
  `hooks/useRingiPreview`, `PreviewChip`, User Management のスイッチ。名前は元のまま、
  対象エリアは `invoices`。不要なら一式削除 (`require-signed-in.ts` の `ringiPreviewGate` も)。
- **ロール**: `admin / faadmin / user ...` (`lib/types/user-profile.ts`) は CAPEX のまま。
  請求書の業務に合わせて見直す。`SUPER_ADMIN_EMAILS` も要確認。
- **メール**: 件名プレフィックス `[CAPEX Budget]` / `[Fm Ringi system]` (`lib/notify/send-mail.ts`)、
  招待・登録依頼メールの文言に CAPEX が残る。
- **`.claude/rules/`**: CAPEX 時代の文書。認証・Dataverse・レスポンシブ・アニメーションの
  規則は生きているが、画面例 (Budget table など) は読み替える。ブランド色 (HOYA Blue
  `#0057BC` / Cyan `#00A3DE` / Cool Grey `#B0B5B5` / Warm Black `#2D2A28`) は閉じた集合。
- 元プロジェクトの 54 の "Rules that bite" は `capex-budget-control/CLAUDE.md` にある。
  認証・Dataverse 書き込み・日本語入力 (IME)・390px スマホ幅などは、そのまま当てはまる。

## 開発

```bash
npm run dev | npm run build | npm run lint | npx tsc --noEmit
```

- テストフレームワークなし。ロジックは使い捨て `.mts` で確かめて消す。
- 作業はブランチで、完了したら `main` にマージ。
- **アプリは英語で作る。** 画面の文言、ボタン、エラーメッセージ、確認ダイアログ、招待・通知メール、
  PDF の文言、Dataverse の表示名はすべて英語。日本語にしてよいのは、Excel のシート名
  `請求_出向者立替費用` のように外部の既存データに由来する固有名だけ。新しい画面・メッセージを
  足すときも英語で書く (日本語が残っていたら、触るついでに英語へ直す)。
  なお、Claude への返信とこのファイルの説明は日本語のまま。
- 金額は `formatAmount()` (`lib/utils/format`) - `toLocaleString()` は必ず `"en-US"` 付き。
- **返信は日本語で**。
