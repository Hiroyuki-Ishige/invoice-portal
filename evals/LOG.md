# eval-loop の記録

## 2026-11-26 r1 - 条件「ダミーのエクセルシートで請求書作成」(初回)

- 読み方: 架空の Excel (本物のシート名・見出し、作り物の金額・住所) を、Excel 読込 → 番号・日付 → 請求書 PDF → 通知メールに通して採点する。
- 課題 4 つ × 1 回: `expense-normal` / `fiscal-boundary` / `patent-negative` / `unregistered-code`。採点役は `Explore` を 4 体。
- 結果: 受け入れ条件 22/22 合格 (6/6・5/5・6/6・5/5)。`checks` の失敗 0。
- 直した失敗の検査: `patent-negative` の `checks` は、マイナス金額の修正 (`patent-sheet.ts`、利用者の報告 2026-11-26) を外すと
  「a negative claim refused the whole workbook again」で失敗し (請求書 0 枚)、戻すと通る (4 枚)。前 → 後: 失敗 1 → 0。
- 層ごとの失敗: なし。記録だけにしたもの: なし。
- ゲート: 1 `tsc`・`build` 通過 / 2 前のラウンド無し (初回) / 3 失敗 1 → 0 / 4 全条件合格 / 5 初回なので基準として記録。
- 時間とトークン (基準): 生成 約 0.6 秒 (4 課題)、採点役 4 体で約 11.5 万トークン・各 12〜22 秒。
- 対象外: PDF の見た目 (配置・はみ出し) はテキストでは判定できない。画面 (`/invoices`) の Saved invoices の再読込の修正もこの評価では測れない。
