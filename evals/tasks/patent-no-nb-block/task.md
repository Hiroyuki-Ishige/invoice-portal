# patent-no-nb-block

R&D (New Business) は 2026/11 から分けて請求しなくなる (経理の連絡、2026-11-26)。`請求_研究` から New Business のブロック (R〜W 列) を消したブックでも読めるか。
架空の Excel (Claim year/month 2026/11):
- `請求_研究`: R&D (C 列のブロック) だけ。HOMT 880,000 = 1.1 × 800,000、部署の表あり。R〜W 列は空 (「Claim to:」は C3 の 1 つだけ)。
- `請求_特許`: Patent は HOGV 210,000 / HLAO 52,500、Patent (New Business) は HOGV 1,050。

連番は 701 から。HLAO の Patent & R&D の既定の表題は DEBIT NOTE。

## 受け入れ条件

1. 読込は成功する (`error` が null)。ブック全体が断られない。
2. 請求書は 4 枚。番号は `HYM1AC2026-701`〜`-704` で、R&D HOMT 880,000 / Patent HOGV 210,000 / Patent HLAO 52,500 (`DEBIT NOTE`) / Patent (New Business) HOGV 1,050 の順。R&D (New Business) の請求書は無い。
3. `warnings` に、R&D (New Business) のブロックが無く、その請求書は作らないと伝える英語の文が 1 つある。ほかの警告は無い。
4. 4 枚とも `pages` が 2。R&D の 2 ページ目に `= 1.1 ×`、`¥800,000`、`Sample Lab A` が出る。日付は `30-Nov-2026`。
5. `issueCheck` は `"ok"`。通知は 1 社 1 通で 3 通 (HOMT・HOGV・HLAO)。PDF と通知に日本語の文字が無い。
6. (2 つ目の入力 `only-nb-left`: 逆に R&D のブロック (C〜H 列) を消し、New Business だけ残したもの) は読込で断られ、エラーは英語で、New Business のブロックしか無く R&D のブロックが無いことを伝える。請求書は 0 枚。
7. 条件の確認: New Business のブロックを消した Excel から、R&D と特許の請求書が作られて発行の確認まで通る。
