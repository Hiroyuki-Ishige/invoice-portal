# expense-statements

立替費用のブックに 2 枚のシートがある月。2 ページ目 (明細) 付きの請求書ができて、発行の確認も通るか。架空の Excel (Claim month 2026/10):
- `請求_出向者立替費用`: 請求先 HLAM 50,000 / HOGV 0 / HOMS-J 12,345 / HLAO 7,000、合計 69,345。その下の A/C 表は会社ごとの列 (HLAM・HOGV・HOMS-J・HLAO) と、
  Excel で**非表示**の空の列 `ITC sample`。A/C は `7000000001` (G/A sample fee)・`7000000002` (G/A sample travel) と、全社 0 の `7000000003` (G/A sample unused)。
- `請求_立替研究`: HOMT、Claim amount 1,234,567。A/C 表は `7650000001` 900,000 / `7750000001` 0 / `7620000001` 334,567、Total 1,234,567。

連番は 201 から。日本語・`※` の文字は、ブラウザでは画像として描かれ、この評価 (Node) の PDF テキストには出ない。そのため判定の対象にしない。

## 受け入れ条件

1. 読込は成功し (`error` が null)、`warnings` は空。行は HLAM 50000・HOMS-J 12345・HLAO 7000 の 3 つ、`rd` は HOMT 1234567。
2. 請求書は 4 枚。番号は `HYM1AC2026-201`〜`-204` で、HLAM・HOMS-J・HLAO・HOMT の順 (HOMT が最後)。HOMT の Description は `Monthly fee for delegation of technology development(reimbursement)`、ほかは `Reimbursement for the expense`。
3. 4 枚とも `pages` が 2。経費の 3 枚の 2 ページ目には、請求先の一覧 (HLAM・HOGV・HOMS-J・HLAO と 0 を含む金額) と、A/C `7000000001`・`7000000002` の行が出る。`7000000003` と `ITC sample` は出ない。
4. HOMT の 2 ページ目には、A/C の 3 行 (0 の `7750000001` を含む)、`Claim to:` の HOMT、Total `1,234,567` が出る。金額はどのページも桁区切り付き。
5. `issueCheck` は `"ok"` (発行のルートの確認を通る)。通知は 1 社 1 通で 4 通。PDF のテキストと通知に日本語の文字が無い。
6. 条件の確認: ダミーの Excel を読み、請求書の作成 (PDF) と発行 (発行のリクエストの確認) まで通っている。
