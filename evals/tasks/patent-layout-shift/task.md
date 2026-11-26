# patent-layout-shift

Patent & R&D の Excel で、`請求_研究` は **2 列・2 行**、`請求_特許` は **1 列・3 行** ずれている (シート名はそのまま)。
架空の値 (2026/12): R&D HOMT 2,000,000 / R&D (New Business) HOMT 150,000 / Patent HOGV 210,000・HLAO 64,000 (Total 274,000) /
Patent (New Business) HOGV 9,000・HOGV2 0 (Total 9,000)。連番は 301 から。

## 受け入れ条件

1. 読込は成功し (`error` が null)、`warnings` は空。
2. 行は R&D HOMT 2000000 / R&D (New Business) HOMT 150000 / Patent HOGV 210000 / Patent HLAO 64000 / Patent (New Business) HOGV 9000 の 5 つで、この順。R&D と R&D (New Business) を取り違えていない (Description で判定)。
3. `checks` の 2 つは `sum` と `sheetTotal` が一致する (274000 と 9000)。
4. 番号は `HYM1AC2026-301`〜`-305`、日付 `31-Dec-2026`、月 `Dec-26`。HLAO は `DEBIT NOTE`、ほかは `INVOICE`。
5. 条件の確認: ズレた位置の Excel から、ズレていないときと同じ請求書ができている。
