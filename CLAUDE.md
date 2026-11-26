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
**R&D 立替 (2026-11-26)**: 同じブックのシート `請求_立替研究` があれば、/invoices の表の最後に 1 行足す (HOMT、
`Monthly fee for delegation of technology development(reimbursement)`)。**1 つの PDF の 1 ページ目が請求書、2 ページ目 (横) が
A/C コード表** (`rd-reimbursement-sheet.ts` = 読込、`statement-record.ts` = 2 ページ目のデータ、`build-pdf.ts` の `drawStatementPage`)。
2 ページ目は `hi_invoice.hi_statement` (JSON) に保存して PDF を作り直す (**列は Top up で追加**)。日本語の科目名は
フォントを埋め込まず、ブラウザの canvas で画像にして貼る (`render-pdf.ts` の `rasterizeText`)。表の Total = Claim amount を確かめる。
**R&D の明細 (2026-11-26)**: Patent & R&D の R&D と R&D (New Business) (HOMT、例 186 / 187) も 2 ページ目に `請求_研究` の部署別の表
(`R&D_2610.pdf` と同じ。`patent-sheet.ts` の `readRdStatement`、`drawDepartmentTable`) を付ける。行は `印刷用ﾌｨﾙﾀｰ` が 印刷 のものだけ
(非表示 なのに金額がある行は止める)。Claim amount = 1.1 × 表の Total を確かめる。表が無ければ 1 ページで発行し警告を出す。
`xlsx-sheet.ts` は `<v xml:space="preserve">` (前後に空白のある文字) も読む (2026-11-26 まで空として読んでいた)。
**経費の明細 (2026-11-26)**: /invoices の経費の請求書 (182〜184 など) にも 2 ページ目を付ける。中身は月 1 枚の `Expenses paid by HOYA_YYYYMM`
(請求先の一覧 + A/C × 会社の表) で、全社分を同じページとして各請求書に付ける (`claim-sheet.ts` の `readExpenseStatement` / `statementFor`、
`drawCompanyTable`)。行は金額のある A/C だけ、列は Excel で非表示の列 (`ITC from HMSJ`) を空なら省く (`isColumnHidden`)。
**Patent の明細 (2026-11-26)**: Patent / Patent (New Business) の請求書 (188〜193) にも、`請求_特許` の各ブロックから 2 ページ目を付ける
(請求先の一覧 = 1.05 × 配賦額・配賦率、Allocation ratio の行、知財チームの A/C 表。`readPatentStatement` / `drawAllocationHead`)。
見本の PDF (Patent_2610.pdf) が無いので、配置はシートどおりに作った。配賦額の和 = 表の Total、各請求額 = 1.05 × 配賦額 (±1 円) を確かめる。
2 ページ目の種類は `Statement.layout` (`account` / `department` / `companies` / `allocation`)。
**段階 2 (2026-11-18、テーブルは `Invoice-Portal` ソリューションに作成済み)**: 発行すると `hi_invoice` / `hi_invoiceline` に保存し、
連番は `hi_invoicesequence` から自動採番 (`lib/invoice/sequence.ts`、`If-Match` で重複なし、年度内 999 まで)。
保存済み一覧・PDF 再生成・取消 (`/invoices`)。作成・取消とも Admin / F&A Admin (`mayCancelInvoices`)。
**ロールは Admin / F&A Admin / User の 3 つ (2026-11-23)**: `invoicepreparer` (値 5) / `invoicereceiver` (値 6) は廃止し、
Dataverse の選択肢は残したまま `getRoleName` が User と読む。Admin > Setup の Top up が、その値の行を User に書き換え、
F&A-Admin の選択肢名を F&A Admin に直す (`migrateRetiredRoles`)。User Management (`/admin/users`) は 1 列・2 カード
(Invite New User / All Users) に作り直した。
**Dataverse の権限は Entra グループ方式 (2026-11-23)**: `Invoice Portal Editors` (Admin / F&A Admin) と `Invoice Portal Readers` (User) を
Dataverse のチームにし、セキュリティロール `Invoice Portal Editor` / `Reader` (+ `Basic User`) を付けた。ユーザーの追加手順は `docs/admin-manual.md`。
テーブルは Admin > Setup の「Invoice tables」、年度ごとの最終番号は「Invoice numbers」で設定。設計: `docs/invoice-design.md`。
テーブルの作成先ソリューションは環境変数 `DATAVERSE_SOLUTION` (`InvoicePortal`)。未設定なら既定ソリューションに入る。
**取引先マスタ**: Admin > Customers (`/admin/customers`, 行 `admin-customers`) で登録し、Dataverse の `hi_invoicecustomer`
(Admin > Setup > Invoice Customer table で作る。組織所有) に入る。`code` が Excel の「Claim to」と一致する鍵で、重複不可。
`customers-seed.ts` の既知の会社 (HLAM / HOGV / HOMS / HOMS-J / HOMT / HOGV2 / HLAO) のうち未登録のものをボタンで投入できる。
**Add from invoice PDF (2026-11-26)**: 発行済みの請求書 PDF の「To:」欄から Add の入力欄を埋める (`customer-from-pdf.ts` = 読み取り、
`customer-from-pdf-browser.ts` = pdf.js でブラウザ内だけで開く。保存は Save を押したとき)。コードは Trading Partner ID からの推測
(HMSJ ≠ HOMS-J のように Claim to と違うことがある)。同じ Trading Partner ID か名前の会社が登録済みなら、その会社の編集を開くだけ。
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
**請求書の一覧 (2026-11-23)**: Issued の一覧と、下の「Cancelled invoices」の箱 (閉じている。理由・Preview・PDF) に分かれる。Created / Cancelled の日時 (取消日時は更新日時 `modifiedon`)。
Admin / F&A Admin は一括キャンセル (1 件ずつ既存の取消 API)。Review の表の Preview (発行前は番号が `XXX` の見本)。発行後は Issue ボタンが無効。
**パスワード付き Excel (2026-11-23)**: 「開くパスワード」付きの .xlsx/.xlsm は、アップロード時にパスワードを聞き、**ブラウザ内だけ**で復号して読む
(`lib/invoice/office-crypto.ts` = MS-OFFCRYPTO Agile、`components/invoices/WorkbookPassword.tsx`。パスワードは送信・保存しない)。旧形式 (Excel 2007 以前) は非対応。
**User の見える範囲 (2026-11-23)**: Admin / F&A Admin は全社の請求書、**User は割り当てられた会社だけ** (`lib/auth/invoice-scope.ts`、
割り当ては User Management の Companies = プロフィールの `hi_entityaccess` に顧客コードを入れる。`/api/invoices` `/api/invoices/[id]` `/api/customers` が絞る)。
アプリの制限であって Dataverse のレコード単位の制限ではない。完了通知メールは `NOTICE_TEST_MODE` の間 `[TEST]` が付き、Invoice Portal へのリンクを含む。
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
  SPA リダイレクト URI は `http://localhost:3000/auth/callback` (ローカルは 2026-11-25 から 3002 に変更。`http://localhost:3002/auth/callback` の登録が必要) と
  `https://invoice-portal-app.vercel.app/auth/callback` (本番、2026-11-23 登録)。
- **本番 (Vercel, 2026-11-23)**: プロジェクト `invoice-portal` (GitHub 連携、`main` への push で自動デプロイ)、
  URL `https://invoice-portal-app.vercel.app`。Production の環境変数は 9 個 (`.env.example` と同じ、
  `AZURE_CLIENT_SECRET` は不要)。`NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_AZURE_REDIRECT_URI` は本番 URL。
  URL を変えるときは、この 2 つと Entra の SPA リダイレクト URI の 3 か所を揃え、再デプロイする。
  Preview URL は Entra に未登録なのでサインインできない。`vercel link` は存在しない名前を渡すと
  プロジェクトを新規作成するので、`--project invoice-portal` で既存に繋ぐこと。
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
- **ロール**: `user / faadmin / admin` (`lib/types/user-profile.ts`)。IIR-Admin (`capexadmin`、値 4) と廃止した invoice 2 ロール (値 5, 6) は選択肢から外した (既存データ用に値だけ残す)。`SUPER_ADMIN_EMAILS` は要確認。
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
  `/review-code-invoice-portal` (3 観点を並列。`-all` で全体、`-l` で深く)、
  `/eval-loop` (架空の Excel で Excel 読込 → 番号 → PDF・通知メールを作り、別のサブエージェントが採点する改善ループ。`evals/` が無ければ初回に作るか聞く)、
  `/c` `/cs` `/r` `/update`。
- `evals/` の架空のシート (`evals/lib/workbook.ts`) には、本物と同じく明細の表 (2 ページ目の元) を既定で入れる。無い場合を試すときだけ `claimSheet(..., { table: false })` で外す (2026-11-26、eval r3)。
- `agents/`: `invoice-security-reviewer` / `invoice-readability-reviewer` / `invoice-performance-reviewer` (読み取り専用)、
  `playwright-test-generator` / `healer` / `planner` (テストの導入は未定。Playwright MCP の設定は未作成)。
- `hooks/restrict-test-writes.sh`: healer の書き込みを `e2e/` と `specs/` に限る。
- `rules/`: CAPEX 時代の文書。認証・Dataverse・レスポンシブ・アニメーションの規則は生きていて、画面例は読み替える。
