# TODO / 開発計画

最終更新: 2026-11-16

現状は「原型」。`/invoices` で立替費用 Excel → 請求書 PDF までは動くが、請求書自体は何も保存しない。
目標は、請求書・明細を Dataverse に保存し、連番を自動採番して、一覧・再発行までできること。

## 0. ブロッカー (IT 管理者の承認待ち)

- [ ] **`User.Read.All` (Graph, Delegated) の管理者同意** - 承認されるまでサインインの動作確認ができない
- [ ] **Dataverse CLI (MCP) の管理者承認** (2026-11-16 依頼済み) - 承認後 `/mcp` で dataverse を Reconnect
  - 用途: テーブル定義の確認と、`hi_` カスタムテーブルの作成・変更 (書き込みあり)
  - テーブルの作成・変更は MCP から実行する前に必ず本人へ確認する
- [ ] 本番 URL を決めて Entra の SPA リダイレクト URI に追加し、`NEXT_PUBLIC_APP_URL` を合わせる

## 1. 事前確認 (承認が下りたらすぐ)

- [ ] Dataverse のテーブル一覧を取得する (MCP)
- [ ] 接続先 `md-mgd-env3-payg` が **CAPEX と同じ環境か**、開発用か本番用かを確認する
  - 共有環境なら、テーブルの作成・変更が CAPEX に影響する。プレフィックスと命名を慎重に決める
- [ ] `hi_userprofiles` / `hi_appsettings` / `hi_invoicecustomers` の存在と列を確認する
- [ ] `hi_entityaccess` / `hi_paymentterms` / `hi_scheduleamounts` はコードに出てくるが由来が不明 → 使用箇所を調べ、不要なら削除する

## 2. 段階 2: 請求書の保存 (中心となる開発)

設計 (承認を待たずに進められる)
- [ ] テーブル設計案を書く: 請求書ヘッダー `hi_invoice` と明細 `hi_invoiceline`
  - 項目: 請求書番号、表題 (INVOICE / DEBIT NOTE)、取引先 (`hi_invoicecustomer` への Lookup)、請求日、通貨、合計、状態、作成者
  - 明細: 請求書への Lookup、日付、摘要、金額、元 Excel の行情報
  - Money 列は通貨の Read 権限が要る点に注意 (`.claude/rules/dataverse.md`)
- [ ] プレフィックスを `hi_` のままにするか、別にするか決める
- [ ] 請求書の状態遷移を決める (下書き / 発行済 / 取消 など)

実装
- [ ] Setup 画面に Invoice / Invoice Line テーブルの作成を追加する (Admin > Setup)
- [ ] 発行時にヘッダーと明細を保存する API を作る
- [ ] 請求書一覧画面 (`/invoices` に一覧、検索、状態フィルター)
- [ ] 保存済みの請求書から PDF を再生成する (保存データが正、PDF は派生物)
- [ ] 取消・訂正の扱い (番号は欠番にせず、取消済みとして残す)

## 3. 連番の自動採番

- [ ] 方式を決める: `HYM1AC{会計年度}-{連番}`、会計年度は 4/1 始まり、連番は 3 桁
  - 同時発行で重複しないこと (Dataverse 側での排他、または採番テーブル)
  - 会計年度が変わったら 001 から振り直す
- [ ] 手入力している連番 (例 `-182`) を、現在の最大値から引き継げるようにする
- [ ] 手入力との併用を残すか、完全に自動にするかを決める

## 4. PDF の保存・共有 (要判断)

- [ ] PDF の保存先を決める: Dataverse のファイル列 / OneDrive / SharePoint
  - OneDrive / SharePoint なら `Files.ReadWrite` / `Sites.Selected` の追加依頼が必要 (ユーザーは再同意が必要)
- [ ] 発行時にメールで送るか、Teams に通知するか (`Mail.Send` は取得済み)

## 5. 原型から持ち越したものの整理

- [ ] **メール文言**: 件名プレフィックス `[CAPEX Budget]` / `[Fm Ringi system]` (`lib/notify/send-mail.ts`)、招待・登録依頼メールの CAPEX 表記を直す
- [ ] **ロール**: `admin / faadmin / user ...` (`lib/types/user-profile.ts`) を請求書の業務に合わせて見直す。`SUPER_ADMIN_EMAILS` も確認する
- [ ] **Ringi preview** (試用メンバー機能): 使うか、一式削除するか決める
  - `lib/auth/ringi-preview`、`lib/settings/ringi-preview`、`hooks/useRingiPreview`、`PreviewChip`、User Management のスイッチ、`require-signed-in.ts` の `ringiPreviewGate`
- [ ] **`.claude/rules/`**: CAPEX 時代の画面例 (Budget table など) を請求書向けに読み替える・削る。ブランド色 (HOYA Blue `#0057BC` / Cyan `#00A3DE` / Cool Grey `#B0B5B5` / Warm Black `#2D2A28`) は閉じた集合
- [ ] `.claude/rules/dataverse.md` の表は CAPEX のもの。請求書用テーブルが決まったら差し替える
- [ ] `User.ReadBasic.All` (`msal-config.ts` に定義のみで未使用) を消す
- [ ] 未使用の `AZURE_CLIENT_SECRET` を `.env.example` から外すか確認する

## 6. 品質・運用

- [ ] 390px 幅のスマホ表示、日本語入力 (IME)、ダークモードを新画面で確認する
- [ ] 画面の文言は英語 (Excel のシート名などの固有名だけ日本語)
- [ ] 金額は `formatAmount()` を使う (`toLocaleString()` は必ず `"en-US"` 付き)
- [ ] 本番デプロイの方針を決める (Vercel を使うか、環境変数、Entra の本番 URL 登録)
- [ ] 完了した機能は CLAUDE.md の「状態」を更新する

## 進め方

- 作業はブランチで行い、完了したら `main` にマージする。
- Dataverse のテーブル作成・変更は、実行前に必ず本人へ確認する。
- テストフレームワークはない。ロジックは使い捨ての `.mts` で確かめて消す。
