# patent-sheet-name

Patent & R&D の Excel で、シート名が `請求-研究 (FY2026)` (`_` が `-`、年度付き) と `請求_特許 ` (末尾に空白)。
架空の値 (2027/01): R&D HOMT 700,000 / R&D (New Business) 0 / Patent HOGV 50,000 (Total 50,000) / Patent (New Business) HOGV 0 (Total 0)。連番は 401 から。

## 受け入れ条件

1. 読込は成功し (`error` が null)、行は R&D HOMT 700000 と Patent HOGV 50000 の 2 つ。
2. 番号は `HYM1AC2026-401` と `-402` (2027/01 は FY2026)、日付 `31-Jan-2027`、月 `Jan-27`。
3. `warnings` に、2 つのシートそれぞれについて実際に読んだ名前を示す英語の文がある。
4. `checks` は `sum` と `sheetTotal` が一致する。
5. 条件の確認: シート名が少し違っても、請求書ができている。
