# patent-negative

Patent & R&D の Excel で R&D (New Business) がマイナス。架空の Excel (Claim year/month は両シートとも 2026/09):
- `請求_研究`: R&D は HOMT 1,500,000 (D4)、R&D (New Business) は HOMT **-98,765** (S4)
- `請求_特許`: Patent は HOGV 300,000 / HOGV2 0 / HLAO 45,000、Total 345,000。Patent (New Business) は HOGV 12,000、Total 12,000

連番は 201 から。取引先マスタでは HLAO の Patent & R&D の既定の表題が DEBIT NOTE、ほかは INVOICE。

## 受け入れ条件

1. 読込は成功する (`error` が null)。マイナスがあっても、ほかの請求書は作られる。
2. 行は R&D HOMT 1500000 / Patent HOGV 300000 / Patent HLAO 45000 / Patent (New Business) HOGV 12000 の 4 つで、この順。マイナスと 0 の行は無い。
3. `warnings` に、マイナスの額 (`-98,765`) とセル (`S4`) を名指しし、請求書を作らないと伝える英語の文がある。`checks` の 2 つは `sum` と `sheetTotal` が一致する。
4. 番号は `HYM1AC2026-201`〜`-204` を行の順に、日付は `30-Sep-2026`、月は `Sep-26`。HLAO の表題は `DEBIT NOTE`、ほかは `INVOICE` で、PDF のテキストにもその表題が出る。
5. 各 PDF の Description は種類どおり (例: R&D は `Monthly fee for delegation of technology development`、Patent (New Business) は `Monthly fee for patent administration (New Business)`)。
6. 通知は 1 社 1 通: HOGV は 2 枚を 1 通にまとめ、全部で 3 通 (HOMT・HOGV・HLAO)。PDF と通知に日本語の文字が無い。
