import { claimSheet, makeWorkbook } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** The expenses sheet under slightly different names, beside unrelated sheets. Figures made up. */
const sheet = claimSheet({ year: 2026, month: 10 }, [["HLAM", 15000]], 15000);
const task: EvalTask = {
  name: "expense-sheet-name",
  kind: "expense",
  firstSequence: 1,
  inputs: async () => [
    { label: "fullwidth-copy", file: await makeWorkbook({ Sheet1: { A1: "x" }, "請求＿出向者立替費用（2）": sheet }) },
    { label: "spaces-fy", file: await makeWorkbook({ " 請求_出向者立替費用 FY2026": sheet, 入力: { A1: "x" } }) },
  ],
  checks: (result) =>
    result.inputs.flatMap((i) => (i.error ? [`${i.label}: refused: ${i.error}`] : i.invoices.length === 1 ? [] : [`${i.label}: expected 1 invoice`])),
};
export default task;
