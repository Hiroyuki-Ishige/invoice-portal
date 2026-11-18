# 請求書の保存・採番 設計 (2026-11-18, 決定済み・実装済み、Dataverse のテーブルは未作成)

決定 (2026-11-18): プレフィックスは `hi_` / 状態は 3 つ / 手入力の連番は廃止 / 連番は 3 桁 (上限 999) /
**作成: Admin・F&A-Admin・Invoice preparer・Invoice receiver、取消: Admin・F&A-Admin・Invoice preparer**。
テーブルは Admin > Setup の「Invoice tables」ボタンで作る (まだ押していない)。

実装での設計との違い:
- 取引先は Lookup でなく **発行時の写し** (`hi_customercode/name/address/...`)。発行済みの書類は、マスタを後で直しても変わらない。
- 新規発行は Draft を経ず **直接 Issued** (Draft は予約)。番号が先に付くので、書類ごとに番号の欠けは出さない。
- 明細は 1 請求書 1 行 (Excel の 1 行 = 1 請求書)。
- 採番テーブルの初期値は Setup の「Invoice numbers」で年度ごとに入れる (手入力済みの最後の番号)。年度が変わった時は前年度の行があれば 1 から自動で始まる。

## 1. テーブル

プレフィックスは既存に合わせて `hi_` (決定待ち。CAPEX と同じ環境なら別プレフィックスも検討)。

### `hi_invoice` (ヘッダー)

| 列 | 型 | 備考 |
|----|----|------|
| `hi_invoicenumber` | Text (主名称) | `HYM1AC{会計年度}-{連番}`。**代替キーで一意** |
| `hi_fiscalyear` | Whole number | 4/1 始まり |
| `hi_sequence` | Whole number | 年度内の連番 |
| `hi_title` | Choice | INVOICE / DEBIT NOTE |
| `hi_customer` | Lookup → `hi_invoicecustomer` | |
| `hi_invoicedate` | Date only | |
| `hi_currency` | Text | 通貨コード。Money 列は使わない (下記) |
| `hi_total` | Decimal | 明細の合計 (保存時に計算) |
| `hi_status` | Choice | Draft / Issued / Cancelled |
| `hi_cancelreason` | Multi-line text | 取消時のみ |
| 作成者・作成日 | 標準列 | `createdby` / `createdon` |

### `hi_invoiceline` (明細)

| 列 | 型 | 備考 |
|----|----|------|
| `hi_invoice` | Lookup → `hi_invoice` | 親 (親子の連鎖削除は付けない) |
| `hi_lineno` | Whole number | 表示順 |
| `hi_linedate` | Date only | |
| `hi_description` | Text | 摘要 |
| `hi_amount` | Decimal | |
| `hi_sourcerow` | Whole number | 元 Excel の行番号 (照合用) |

**Money 型を避ける理由**: Money 列は通貨 (`transactioncurrency`) の Read 権限がないと作成が 403 になる (`.claude/rules/dataverse.md`)。請求書は通貨を自前で持つので Decimal で足りる。

## 2. 状態遷移

```
Draft ──発行──▶ Issued ──取消──▶ Cancelled
  └──削除 (Draft のみ)
```

- 番号は **発行時に採番**。Draft は番号なし → 欠番が出ない。
- Issued は編集不可。訂正は「取消 + 新規発行」。Cancelled の番号は残す (再利用しない)。
- 保存データが正。PDF は保存データから毎回生成する。

## 3. 連番の自動採番

Dataverse の自動採番列は年度ごとのリセットができないので使わない。

**採番テーブル `hi_invoicesequence`** (1 年度 1 行: `hi_fiscalyear`, `hi_lastsequence`):

1. 該当年度の行を読み、ETag を控える。
2. `hi_lastsequence + 1` を `PATCH` する。**`If-Match: <ETag>`** を付ける。
3. `412 Precondition Failed` (他の人が先に取った) なら 1 に戻って再試行 (3 回まで)。
4. 取れた番号でヘッダーを `POST`。`hi_invoicenumber` の **代替キー (一意)** が最後の砦。
5. 年度の行がなければ作る (連番 0 から)。

- 初期値: 手入力で発行済みの最大値 (例 182) を最初の行に入れる。Setup の画面で入力できるようにする。
- 4 の `POST` が失敗した場合は番号が飛ぶ。欠番は許容し、記録に残す (要判断)。
- 手入力との併用は廃止 (自動のみ)。必要なら管理者だけ「次の番号を設定」できる。

## 4. 決めてほしいこと

1. プレフィックス: `hi_` のままでよいか。接続先は CAPEX と同じ環境か。
2. 状態は Draft / Issued / Cancelled の 3 つでよいか (承認フローは不要か)。
3. 手入力の連番は完全に廃止してよいか。
4. 既存の発行済み請求書の最大連番はいくつか (採番の初期値)。
5. 取消は誰ができるか (ロール)。
