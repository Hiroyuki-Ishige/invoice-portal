# unregistered-code

取引先マスタに無い会社コード。架空の Excel: Claim month 2026/07、行は HLAM 50,000 / HOMS 44,000 / HOMS-J 7,000、合計 101,000。
マスタ (`evals/lib/fixtures.ts`) に HOMS は無い。連番は 1 から。

## 受け入れ条件

1. 読込は成功し、行は 3 つとも読まれる (HOMS も `parsed.lines` にある)。`sheetTotal` 101000 と行の和が一致する。
2. `unregistered` は `HOMS` だけ。HOMS の請求書・通知は無い。
3. 請求書は HLAM と HOMS-J の 2 枚、番号は `HYM1AC2026-001` と `-002` (HOMS が番号を使っていない)。
4. HOMS-J の PDF のテキストに `HOMS-J` の会社名 (マスタの名前) と `7,000` が出る。HOMS と HOMS-J を取り違えていない。
5. 条件の確認: 入力はダミーの Excel で、登録済みの会社の請求書 PDF ができている。
