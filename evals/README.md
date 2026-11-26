# evals

`/eval-loop` (`.claude/commands/eval-loop.md`) が使う評価の仕組み。架空の Excel を、アプリのコード (Excel 読込 → 番号・日付 →
請求書 PDF → 完了通知メール) に通し、出力を別のサブエージェントが `task.md` の受け入れ条件で採点する。

```bash
npx tsx evals/run.mts [round] [task ...]   # 例: npx tsx evals/run.mts r1
npm run eval                                       # = npx tsx evals/run.mts。pre-commit (.githooks/pre-commit) と GitHub Actions (.github/workflows/eval.yml) も同じものを回す
npx tsx evals/compare.mts <前のラウンド> <今のラウンド>   # 出力が前と同じ課題は採点役なしで済ませる (違えば終了コード 1)
```

- **課題はすべて常設** (2026-11-26 に利用者が決定)。毎回のラウンドで全課題を回す。前のラウンドと出力が同じ課題は、比べるだけで採点役を呼ばなくてよい
- `tasks/<名前>/task.ts` - 架空の Excel を作る (`lib/workbook.ts`)、受け入れ条件のうち機械で決まるもの (`expect`、`lib/expect.ts`)、直した失敗を見張る `checks`。`task.md` - 受け入れ条件
- **機械で決まる条件は毎回 `run.mts` が判定する** (どの課題にも共通の規則 `commonChecks` と、課題ごとの `expect`)。採点役は文言の判断など機械で決まらないものと、新しい課題・出力が変わった課題だけに使う
- `lib/fixtures.ts` - 架空の取引先マスタ (コードだけ本物、名前・住所は作り物。HOMS は無い)
- 出力: `out/<round>/<task>/` に `result.json`・入力の `.xlsx`・PDF とそのテキスト・通知の HTML (`out/` は git 管理外)
- `run.mts` は画面と同じく、各請求書に 2 ページ目 (明細) を付け、経費のブックでは `請求_立替研究` も読む。発行は `validateIssueRequest` に通した結果 (`issueCheck`) で見る
- 架空のシート (`lib/workbook.ts`) には、本物と同じく明細の表を既定で入れる (`claimSheet(..., { table: false })` で外せる)
- 記録: `LOG.md`

**Dataverse と Microsoft Graph は呼ばない** (`.env.local` を読まず、`sequence.ts`・Dataverse のクライアント・`send-mail` を import しない)。
**入力はすべて架空**。経理の本物の Excel・PDF は開かない。
