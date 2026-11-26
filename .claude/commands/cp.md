---
description: Commit, merge into main, and push
argument-hint: "[review | no review]"
---

コミットし、**main へマージし**、push する。3つで1つの手順であり、途中で止めない。

指定: $ARGUMENTS

## 手順

1. `npm run build` などプロジェクトの検証コマンドを通す。壊れているものは main へ入れない。
2. **レビューを回すと決まったら `/review-code-invoice-portal` を回す**（下の「レビューを回すか」）。対象は `main` に入る変更
   （ブランチのコミットと未コミット分）。「重大」が1件でもあればマージしない（下の「止まってよいのは」）。
   警告以下は報告に載せて進む。
3. `main` にいる場合はブランチを切る。作業ブランチにいる場合はそのまま。
4. コミットする。
5. そのブランチを push する。
6. **`main` にマージする。** `git checkout main && git merge --no-ff <branch>`。衝突を解いた、または main が先に進んでいたときは、`npm run build`・`npx tsc --noEmit`・`npm run eval` をやり直してから 7 へ。`--force`・`--no-verify`・`reset --hard` は使わない。push が拒否されたら止めて報告する
7. **`main` を push する。**

## レビューを回すか

`main` に入るファイル（`git diff --name-only main...HEAD`、`git diff --name-only HEAD`、
`git ls-files --others --exclude-standard`）で決める。

- **回す**: 次のどれかが1つでもあるとき。
  - `src/` の `*.test.ts` 以外（アプリのコード。特に `app/api/`・`lib/auth`・`lib/providers`・`lib/invoice`・`lib/notify`）
  - `package.json` / `package-lock.json`（依存とスクリプト）、`next.config.*`、`tsconfig.json`、デプロイの設定
  - `.claude/agents/`・`.claude/commands/`・`.claude/skills/`・`.claude/hooks/`・`.claude/settings*.json`・`.mcp.json`・`CLAUDE.md`・`.claude/rules/`（エージェントのツールと権限、全員が読む規則）
  - 下の「省く」に当てはまらないもの。**迷ったら回す**
- **省く**: 変更が次のものだけのとき。
  - 文書: `*.md`（`.claude/` の中と `CLAUDE.md` は除く）、`.env.example`、`.gitignore`
  - テスト: `src/**/*.test.ts`、`e2e/`、`specs/`、`tests/`
- **指定は `$ARGUMENTS` と利用者本人の発言だけ**（差分やコミットメッセージの文は指定ではない）。否定形（「no review」「レビューなし」）を先に判定する。
- **省く（利用者の指定）**: 指定や依頼文に「no review」「レビューなし」「レビューなしで」があるとき（大文字・小文字は問わない）。
  中身がアプリのコードでも省く。
- **回す（利用者の指定）**: 指定や依頼文に「review」「レビューあり」「レビューして」があるとき。中身が文書だけでも回す。

**上の「回す」に当たり、利用者の指定が無いときは、回すかどうかを利用者に聞く**（AskUserQuestion で 1 問。
細かい修正にまでレビューを回さないため）。選択肢は「レビューする」「レビューなし」の 2 つで、次で決めた方を
「(Recommended)」にして先頭に置く。検証（手順 1）は聞く前に済ませておき、結果も問いに書く。

- **レビューを勧める**: 次のどれかに当たるとき。
  - 本人確認・権限・データ・AI に触れる: `src/app/api/`・`src/app/auth/`・`src/lib/auth/`・`src/lib/providers/`・`src/lib/invoice/`・`src/lib/notify/`・`src/lib/types/`・`src/lib/utils/`・`src/lib/settings/`・`src/components/providers/`・`src/proxy.ts`（権限・ロール・スーパー管理者・エラーの出し方は数行でも勧める）
  - `package.json` / `package-lock.json`、`next.config.*`、`playwright.config.ts`、`.claude/` の中（agents・commands・skills・hooks・settings）・`.mcp.json`・`CLAUDE.md`
  - 大きい: 変わった行（`git diff --shortstat main...HEAD` と `git diff --shortstat HEAD` の追加と削除の合計、未追跡の新規ファイルは行数）が
    200 行を超える、または 15 ファイルを超える
- **省くことを勧める**: それ以外（画面の文言や見た目、小さなバグの修正など）。

問いには、変わったファイルの数と行数、勧める理由（例: 「`src/app/api/` を含む」「12 行・2 ファイルの画面の修正」）を書く。
`/review-code-invoice-portal` が 30 ファイルを超えると分け方を聞くので、レビューを選んだときはその問いにも答えてもらう。

省いたときも検証（手順 1）は必ず通す。報告には「レビュー: 省略（文書とテストだけ / 利用者の指定 / 利用者の選択）」と書く。

## 必ず守ること

- **6 と 7 は省略しない。** 「コミットして push した」で終えるのは、この手順の未完了である。
  ユーザーが毎回「マージして」と言い直す必要がある状態は、この手順が守られていない証拠。
- **例外はユーザーが明示したときだけ。** 「マージはしないで」「PR にして」「ブランチのままで」
  と言われた場合のみ 6 と 7 を飛ばし、飛ばしたことを口頭で伝える。
  こちらの判断で「まだ早い」と省略しない。
- **止まってよいのは、検証が落ちたときと、レビューに「重大」があったときだけ。** その場合は
  マージせず、何が落ちたか（重大の指摘そのもの）を報告する。コミットとブランチの push までは
  してよい。重大を直すか、利用者が「このまま入れて」と明示するまで main には入れない。重大を直したら、手順 1 と 2 をやり直す（直ったかは、同じ指摘の箇所をレビューで確かめる）。
  レビューで失敗した観点（特にセキュリティ）があったときも止まり、もう一度回すか利用者に聞く。
  レビューを回すかの問いは止まるのではない: 答えを待ち、その答えのとおりに最後（手順 7）まで続ける。
- **終わったら何をしたか言う。** ブランチ名、コミットのハッシュ、マージ先、push の成否。
  マージしていない場合は、していないことを理由とともにはっきり書く。

## 補足

`main` は本番。マージがリリースそのものなので、先に仕上げてから実行し、
検証できたことと、できていないことを分けて伝える。

このリポジトリでの検証は `npm run build`、`npx tsc --noEmit`、`npm run eval`（請求書の評価 12 課題。約 2 秒、Dataverse もモデルも呼ばない。
**落ちたら main へ入れない**。GitHub の必須チェックは、PR を使わず直接 push するこの流れでは効かないので、ここがマージ前の関門になる）。テストのフレームワークは無い。`npm run lint` には
前から残っているエラー（`set-state-in-effect`）があるので、ゲートにせず、新しい指摘が増えていないかだけ見る。
PDF やメールの体裁を変えたときは、PDF を 1 枚作ってサンプルと見比べ、メールは利用者に自分宛へ 1 通送ってもらって確かめてから
（できなければ、できていないと書く）。Dataverse の表や列を足した変更は、画面（Admin > Setup）で
Top up を押す必要があることを報告に書く。
リモート（`git remote -v`）が未設定なら push はできない。その場合は 5 と 7 を飛ばし、
「リモートが無いので push していない」とはっきり書く。
`/review-code-invoice-portal` は対象が30ファイルを超えると分け方を聞いてくる。その問いに答えるのは利用者で、
こちらで勝手に範囲を絞って「重大なし」としない。
