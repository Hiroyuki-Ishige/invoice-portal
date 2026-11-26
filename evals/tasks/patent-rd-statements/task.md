# patent-rd-statements

Patent & R&D のブックで、全部の請求書に 2 ページ目 (明細) が付くか。架空の Excel (Claim year/month 2026/11):
- `請求_研究`: R&D は HOMT 1,100,000 = 1.1 × 1,000,000、R&D (New Business) は HOMT 55,000 = 1.1 × 50,000。各ブロックの下に部署の表
  (`Sample Lab A`・`Sample Lab B`、New Business は `Sample New Business`)。A/C は `6000000001`・`6000000003`。`6000000002` は 0 で、印刷用ﾌｨﾙﾀｰが `非表示`。
- `請求_特許`: Patent は HLAM 0 / HOGV 420,000 / HOGV2 315,000 / HLAO 105,000 で、それぞれ 1.05 × 配賦額 (400,000 / 300,000 / 100,000)。
  Patent (New Business) は HOGV 2,100 / HOGV2 0 / HLAO 1,051 (1.05 × 1,001 = 1,051.05 で 1 円未満のずれ)。表は `Sample IP team` (New Business は `Sample New Business`)。

連番は 501 から。HLAO の Patent & R&D の既定の表題は DEBIT NOTE。日本語の文字は、ブラウザでは画像として描かれ、この評価の PDF テキストには出ない。そのため判定の対象にしない。

## 受け入れ条件

1. 読込は成功し、`warnings` は空。行は R&D HOMT 1100000 / R&D (NB) HOMT 55000 / Patent HOGV 420000・HOGV2 315000・HLAO 105000 / Patent (NB) HOGV 2100・HLAO 1051 の 7 つで、この順 (0 の行は無い)。
2. 番号は `HYM1AC2026-501`〜`-507` を行の順に、日付は `30-Nov-2026`。HLAO の 2 枚の表題は `DEBIT NOTE`。
3. 7 枚とも `pages` が 2。R&D の 2 ページ目に `= 1.1 ×` と `¥1,000,000`、`Sample Lab A`・`Sample Lab B`、A/C `6000000001` と `6000000003` が出て、`6000000002` は出ない。
4. Patent の 2 ページ目に、`Claim to:` の `HLAM/HOGV/HOGV2/HLAO`、`= 1.05 ×`、配賦額 (`¥400,000` など) と比率、`Allocation ratio:`、`Sample IP team`、Total `800,000` が出る。
   Patent (New Business) の 2 ページ目の Total は `3,001`。
5. `issueCheck` は `"ok"`。通知は 1 社 1 通で 4 通 (HOMT・HOGV・HOGV2・HLAO)。PDF のテキストと通知に日本語の文字が無い。
6. 条件の確認: ダミーの Excel を読み、請求書の作成 (PDF) と発行 (発行のリクエストの確認) まで通っている。
