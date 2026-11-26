import { claimSheet, makeWorkbook, rdReimbursementSheet } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/**
 * When a detail table does not add up, the app says so - and only what it must refuses:
 * - a hidden column that holds an amount is shown, not dropped, so the A/C table no longer matches the
 *   claim list: the expenses workbook is refused, naming the sheet;
 * - 請求_立替研究 whose A/C table does not reach its Claim amount: the expenses are still issued, the
 *   R&D reimbursement is not, and a warning says why;
 * - no A/C table at all: one-page invoices and a warning.
 * Figures made up.
 */
const claim = { year: 2026, month: 8 };
const task: EvalTask = {
  name: "statement-refusals",
  kind: "expense",
  firstSequence: 601,
  inputs: async () => [
    {
      label: "hidden-amount",
      file: await makeWorkbook(
        {
          請求_出向者立替費用: claimSheet(claim, [["HLAM", 30000], ["HOGV", 20000]], 50000, {
            extraColumn: { name: "ITC sample", code: "ZZ9999", amounts: [5000, 0, 0] },
          }),
        },
        { 請求_出向者立替費用: ["G"] }
      ),
    },
    {
      label: "rd-broken",
      file: await makeWorkbook({
        請求_出向者立替費用: claimSheet(claim, [["HLAM", 30000], ["HOGV", 20000]], 50000),
        請求_立替研究: rdReimbursementSheet(claim, "HOMT", [["7650000001", "R/E sample supplies", "研_見本消耗品", 400000]], 450000, 400000),
      }),
    },
    {
      label: "no-table",
      file: await makeWorkbook({ 請求_出向者立替費用: claimSheet(claim, [["HLAO", 8000]], 8000, { table: false }) }),
    },
  ],
  checks: (result) => {
    const [hidden, broken, noTable] = result.inputs;
    const failures: string[] = [];
    if (!hidden.error?.includes("請求_出向者立替費用")) failures.push(`hidden-amount: expected a refusal naming the sheet, got ${hidden.error ?? "no error"}`);
    if (broken.error || broken.invoices.map((i) => i.customerCode).join(",") !== "HLAM,HOGV") {
      failures.push(`rd-broken: expected HLAM and HOGV only, got ${broken.error ?? broken.invoices.map((i) => i.customerCode).join(",")}`);
    }
    if (!broken.parsed?.warnings.some((w) => w.includes("請求_立替研究"))) failures.push("rd-broken: no warning names 請求_立替研究");
    if (noTable.invoices.length !== 1 || noTable.invoices[0].pages !== 1) failures.push("no-table: expected one one-page invoice");
    return failures;
  },
};
export default task;
