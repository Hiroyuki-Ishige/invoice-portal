# TODO / 開発計画

最終更新: 2026-11-23

現状: 立替費用と Patent & R&D の Excel から請求書を発行・保存・取消し、完了通知メールを送るところまで動く。
本番は `https://invoice-portal-app.vercel.app` (GitHub 連携、`main` への push で自動デプロイ)。

## 1. あなたの操作・判断を待っているもの

実機でしか確かめられないもの
- [ ] **パスワード付き Excel** (開くパスワード) を Expenses と Patent & R&D の両方で読み込む。ダイアログが出て開けるか
- [ ] **堅牢化した Excel 読み取り** を、実際の立替費用・特許研究費用の Excel で確かめる (いつもと同じ会社・金額・合計か)
- [ ] **完了通知メール** を、宛先を自分にして 1 通送る。体裁、添付 PDF、Outlook での見え方、Invoice Portal へのボタン
- [ ] User ロールで、割り当てた会社の請求書だけが見えること (割り当てていない会社は見えないこと)
- [ ] `/guide/mfa` を、サインアウトした状態で開けること。IT 部門に、手順が会社の設定と合っているか見てもらう

決めてほしいもの
- [ ] **通知メールの `[TEST]` を外す時期** (`src/lib/notify/invoice-notice.ts` の `NOTICE_TEST_MODE` を `false` にする)
- [ ] **IIR-Admin (値 4) のユーザー** が残っていないか。いれば User に移すか (今はどの画面も開けない)
- [ ] **既存の User に会社を割り当てる** (User Management の Companies)。割り当てがない User は請求書が見えない
- [ ] `hi_entityaccess` に **CAPEX 時代の拠点コード** (V1、HLAO など) が残っていないか。同じ文字列の会社コードがあると、閲覧権として効く
- [ ] **マージ済みの作業ブランチの削除** (ローカルとリモート)。許可があれば消す

承認待ち
- [ ] **Dataverse CLI (MCP) の管理者承認** (2026-11-16 依頼済み)。承認後 `/mcp` で dataverse を Reconnect
- [ ] PDF の保存先を決める (Dataverse のファイル列 / OneDrive / SharePoint)。OneDrive / SharePoint なら `Files.ReadWrite` / `Sites.Selected` の追加依頼が要る

## 2. 次にやる候補 (開発)

請求書まわり
- [ ] **立替研究費の請求書** (利用者の報告 2026-11-26): `立替研究・出向者立替費用計算` の R&D supplies… on behalf of HOMT のシートを読む。シート名・Description の文言・置く画面を確認待ち
- [ ] **HOMS の取引先登録** (同): 社名・住所・Trading partner ID が分かれば Admin > Customers で登録 (今は未登録で請求書が作れない)
- [ ] **マイナスの請求の扱い** (同): 今は請求書を作らず警告だけ。Credit Note を発行するか決める
- [ ] **一部だけ失敗したときの再発行**: 今は 3 件中 1 件が失敗すると Issue ボタンが「Issued」になり、失敗した分だけをやり直せない
- [ ] **合計の不一致・警告があるときの発行**: 今は表示だけで、発行は止めない。確認のダイアログを挟むか決める
- [ ] **取消日時を専用の列に** (`hi_cancelledat`、日時)。今は更新日時 (`modifiedon`) を取消日時として出している (取消以外で更新する機能を足すとずれる)
- [ ] 請求書の Draft 状態の使い道 (今は使っていない)

権限・安全
- [ ] **User の会社の制限を Dataverse 側でも行う**: 今はアプリの制限。`Invoice Portal Reader` は全社を読めるので、Dataverse を直接呼べる人は全社分を読める。完全に分けるにはビジネスユニットか所有チーム
- [ ] 一括取消・通知の小さな指摘: 検索で隠れているチェック済みも取消対象になる点、16px のチェックの押しやすさ、スーパー管理者の取消ボタンの扱いの食い違い

整理
- [ ] ユーザー移行 (`migrateRetiredRoles`) の ID 検査を共通の `validateUUID()` にそろえる。一度に 500 行までの上限
- [ ] **`.claude/rules/`** の CAPEX 時代の画面例 (Budget table など) を請求書向けに読み替える・削る。`dataverse.md` の表も CAPEX のもの
- [ ] コード内に残る CAPEX 由来の部品 (承認ステップ `approval-steps.ts`、`add-column.ts` のソリューション名、`checkMayDeleteEmptyItems` など) の整理
- [ ] 390px 幅のスマホ表示、日本語入力 (IME)、ダークモードを新しい画面 (User Management、Preview、一括取消、通知の宛先選択) で確認する

## 3. 完了したもの (2026-11 の主なもの)

- [x] 請求書の保存・自動採番・一覧・PDF 再生成・取消 (Dataverse)、Patent & R&D の請求書
- [x] 本番デプロイ (Vercel `invoice-portal`)、URL `invoice-portal-app.vercel.app`、Entra のリダイレクト URI
- [x] ロールを Admin / F&A Admin / User の 3 つに、User Management を作り直し (登録だけ / 登録して招待メール、招待メールのプレビュー、アプリ URL のコピー)
- [x] Dataverse の権限を Entra グループ方式に (`Invoice Portal Editor` / `Reader`)、Admin マニュアル (`docs/admin-manual.md`、画面の Admin Guide)
- [x] MFA 設定ガイド (`/guide/mfa`、英語・日本語、図つき)、招待メールと通知メールからリンク
- [x] ひし形のローディング、Cancelled 請求書の別の箱、一括キャンセル、作成日時・取消日時の表示
- [x] Review の表の Preview (発行前は見本)、発行後の Issue ボタンの無効化
- [x] 完了通知メールのプレビューと `[TEST]` 表示、送信先 (会社・アドレス) の選択、二重送信の防止
- [x] User は割り当てられた会社の請求書だけ見える (サーバー側で絞る)
- [x] Excel 読み取りの堅牢化 (請求月をラベルで探す、空白行を越える、合計が無いときの警告)
- [x] パスワード付き Excel をブラウザ内で復号して読む (パスワードは送信・保存しない)
- [x] 画面に残っていた CAPEX 時代の文言 (Role Permissions の説明、ユーザー削除の確認文) を請求書向けに修正

## 4. Claude の道具 (`.claude/`) の積み残し

- [ ] **Playwright MCP (`playwright-test`) の設定が無い**: `.mcp.json` も `@playwright/test` も無いので、playwright の 3 担当
  (generator / healer / planner) は動かない。テストを入れると決めたときに、`.mcp.json`・`playwright.config.ts`・`e2e/` を足す。
  足すときは、ブラウザを専用プロファイルで起動する (普段の Chrome や SSO を使うと、サインインして本物の Dataverse・Graph に届く)
- [ ] **`/cp` に `allowed-tools` を付けていない**: `Bash(git push:*)` は前方一致で `--force` まで許すため。
  `--force` / `--no-verify` / `reset --hard` を使わない決まりは、文書 (`cp.md`) に書いてあるだけ
- [ ] `~/.claude/settings.json` (利用者全体の設定) で、healer の書き込み制限 (hook) と `Agent(...)` の名前の絞り込みが効くかを一度試す
- [ ] `/review-code-invoice-portal` を `-all` で実際に回したことが無い。21 体の分け方が妥当かを、最初に回したときに確かめる

## 進め方

- 作業はブランチで行い、完了したら `main` にマージする。
- Dataverse のテーブル作成・変更は、実行前に必ず本人へ確認する。
- テストフレームワークはない。ロジックは使い捨ての `.mts` で確かめて消す。
- 完了した機能は CLAUDE.md の「状態」にも書く。
