# Invoice Portal (請求書作成ポータル)

請求書の作成・発行・管理ポータル。**capex-budget-control を原型に作った骨格**
(2026-11-16)。macOS Tahoe デザイン、Next.js 16 + Dataverse + Azure AD (MSAL)。

## 状態: 原型 (prototype)

動くもの: サインイン (MSAL) / 登録ユーザーの判定 / ロール権限表 / User Management /
Role Permissions / Setup (ユーザー・請求書・取引先の各テーブル) / ヘッダー・サイドレール / ダーク
モード / 招待メール / 請求書の発行・保存・一覧・取消 / 完了通知メール。
**`/invoices` (段階 1, 2026-11-16)**: 立替費用 Excel (シート `請求_出向者立替費用`) をアップロード →
表題 (INVOICE / DEBIT NOTE) を行ごとに選ぶ → 請求書 PDF を作る。部品は `lib/invoice/` (`claim-sheet` =
Excel 読込、`build-pdf` = PDF、`invoice-number` = `HYM1AC{会計年度}-{連番}`、会計年度は 4/1 始まり)。
**段階 2 (2026-11-18、テーブルは `Invoice-Portal` ソリューションに作成済み)**: 発行すると `hi_invoice` / `hi_invoiceline` に保存し、
連番は `hi_invoicesequence` から自動採番 (`lib/invoice/sequence.ts`、`If-Match` で重複なし、年度内 999 まで)。
保存済み一覧・PDF 再生成・取消 (`/invoices`)。作成は Admin / F&A-Admin / Invoice preparer / Invoice receiver、
取消は Admin / F&A-Admin / Invoice preparer (`mayCancelInvoices`)。新ロール `invoicepreparer` (値 5) / `invoicereceiver` (値 6)。
テーブルは Admin > Setup の「Invoice tables」、年度ごとの最終番号は「Invoice numbers」で設定。設計: `docs/invoice-design.md`。
テーブルの作成先ソリューションは環境変数 `DATAVERSE_SOLUTION` (`InvoicePortal`)。未設定なら既定ソリューションに入る。
**取引先マスタ**: Admin > Customers (`/admin/customers`, 行 `admin-customers`) で登録し、Dataverse の `hi_invoicecustomer`
(Admin > Setup > Invoice Customer table で作る。組織所有) に入る。`code` が Excel の「Claim to」と一致する鍵で、重複不可。
`customers-seed.ts` の既知の会社 (HLAM / HOGV / HOMS-J / HOMT / HOGV2 / HLAO) のうち未登録のものをボタンで投入できる。
取引先ごとに **請求書の種類別の既定の表題** (`defaultTitles`、列 `hi_defaulttitles`) を持つ (例: HLAO の Patent & R&D は DEBIT NOTE)。
**Patent & R&D (`/invoices/patent-rd`、2026-11-18)**: `特許・研究費用計算(FY….xlsm)` のシート `請求_研究` と `請求_特許` から、
R&D (HOMT) / Patent (HOGV, HOGV2, HLAO) と、それぞれの New Business 分で月 8 枚前後を発行する。同じ番号・保存・一覧・取消の仕組み
(`lib/invoice/patent-sheet.ts` が Excel 読込、`xlsx-sheet.ts` が両方の共通の読み口)。1 社が 1 か月に 2 枚になるので、発行 API の
各行が `description` を持ち、画面は会社コードでなく行番号で扱う。`/invoices` と `/invoices/patent-rd` はタブで行き来する。
**完了通知メール (2026-11-18)**: Admin > Mail Notifications (`/admin/notifications`、行 `admin-notifications`、Admin と F&A-Admin) で取引先ごとの To / Cc を
Microsoft 365 のユーザー検索で選ぶ (列 `hi_notifyto` / `hi_notifycc`)。発行後と保存済み一覧のチェックから、1 社 1 通で送る
(`lib/notify/invoice-notice.ts`、`NotifyPanel`)。**自動では送らない**: 宛先を見せて、押した人のメールボックスから送る。PDF は任意で添付。
**ユーザーのテーブルは Invoice Portal 専用** `hi_invoiceuserprofile` (`USER_PROFILE_*` 定数。CAPEX の `hi_userprofile` とは別)。
Ringi preview (試用メンバー)・Budget plan access・IIR-Admin ロールは削除済み (`capexadmin` の値 4 は既存データ用に残る)。
**未実装**: PDF ファイル自体の保存 (データから毎回作る)、Draft 状態の使用。

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
  未使用だった `User.ReadBasic.All` の定義と `.env.example` の `AZURE_CLIENT_SECRET` は
  2026-11-18 に削除 (Application 権限も不要)。
- **`User.Read.All` は管理者同意が必要**だったが、**2026-11-18 に承認済み** (全 4 権限が
  Granted for HOYA Corporation)。サインイン確認済み (Admin で入れた)。
- 請求書の保存・採番の設計案は `docs/invoice-design.md` (提案、未承認。テーブルは未作成)。
- 将来 PDF を OneDrive / SharePoint に保存する、Teams 通知する等を決めたら
  `Files.ReadWrite` / `Sites.Selected` / `Mail.ReadWrite` などを個別に追加依頼する
  (追加するとユーザーは再同意が必要)。

## 原型から持ち越したもの (整理の候補)

- **`hi_` プレフィックス・`hi_userprofiles`・`hi_appsettings`** をそのまま使う。
  請求書用の新テーブルも `hi_` に揃えるか、別プレフィックスにするか決める。
- **ロール**: `user / invoicereceiver / invoicepreparer / faadmin / admin` (`lib/types/user-profile.ts`)。IIR-Admin (`capexadmin`) は選択肢から外した (値 4 は既存データ用に残す)。`SUPER_ADMIN_EMAILS` は要確認。
- **ユーザーテーブルは Invoice Portal 専用** `hi_invoiceuserprofile` (2026-11-18、CAPEX の `hi_userprofile` とは別)。Ringi preview (試用メンバー) と Budget plan access (Entity access) の画面は削除済み。
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

- テストフレームワークなし。ロジックは使い捨て `.mts` で確かめて消す。`npm run lint` には前からのエラー
  (`set-state-in-effect`) があるので、ゲートは `npm run build` と `npx tsc --noEmit`。
- Dataverse のテーブル・列の作成と変更は、実行前に必ず本人へ確認する。画面 (Admin > Setup) の
  Create / Top up ボタンを本人が押すのが基本。列を足したコードをマージしたら、Top up が要ると報告する。
- 作業はブランチで、完了したら `main` にマージ。
- **アプリは英語で作る。** 画面の文言、ボタン、エラーメッセージ、確認ダイアログ、招待・通知メール、
  PDF の文言、Dataverse の表示名はすべて英語。日本語にしてよいのは、Excel のシート名
  `請求_出向者立替費用` のように外部の既存データに由来する固有名だけ。新しい画面・メッセージを
  足すときも英語で書く (日本語が残っていたら、触るついでに英語へ直す)。
  なお、Claude への返信とこのファイルの説明は日本語のまま。
- 金額は `formatAmount()` (`lib/utils/format`) - `toLocaleString()` は必ず `"en-US"` 付き。
- **返信は日本語で**。

## Claude の道具 (`.claude/`)

- `commands/`: `/cp` (検証 → 任意のレビュー → コミット → `main` へマージ → push。`/cp review` でレビューを回す)、
  `/review-code-invoice-portal` (3 観点を並列。`-all` で全体、`-l` で深く)、`/c` `/cs` `/r` `/update`。
- `agents/`: `invoice-security-reviewer` / `invoice-readability-reviewer` / `invoice-performance-reviewer` (読み取り専用)、
  `playwright-test-generator` / `healer` / `planner` (テストの導入は未定。Playwright MCP の設定は未作成)。
- `hooks/restrict-test-writes.sh`: healer の書き込みを `e2e/` と `specs/` に限る。
- `rules/`: CAPEX 時代の文書。認証・Dataverse・レスポンシブ・アニメーションの規則は生きていて、画面例は読み替える。
