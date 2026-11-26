import { claimSheet, makeWorkbook, rdReimbursementSheet } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/**
 * The expenses workbook with both sheets: 請求_出向者立替費用 with its A/C table (a hidden, empty
 * internal column and an all-zero A/C row, both left off page 2) and 請求_立替研究 for HOMT (one
 * invoice after the expenses, with its A/C table as page 2). Figures and names made up.
 */
const claim = { year: 2026, month: 10 };
const task: EvalTask = {
  name: "expense-statements",
  kind: "expense",
  firstSequence: 201,
  inputs: async () => [
    {
      label: "2026-10",
      file: await makeWorkbook(
        {
          請求_出向者立替費用: claimSheet(claim, [["HLAM", 50000], ["HOGV", 0], ["HOMS-J", 12345], ["HLAO", 7000]], 69345, {
            extraColumn: { name: "ITC sample", code: "ZZ9999" },
          }),
          請求_立替研究: rdReimbursementSheet(
            claim,
            "HOMT",
            [
              ["7650000001", "R/E sample supplies", "研_見本消耗品", 900000],
              ["7750000001", "R/E sample repair", "研_見本修繕", 0],
              ["7620000001", "R/E sample service", "研_見本手数料", 334567],
            ],
            1234567
          ),
        },
        { 請求_出向者立替費用: ["I"] }
      ),
    },
  ],
  checks: (result) => {
    const input = result.inputs[0];
    if (input.error) return [`refused: ${input.error}`];
    const failures: string[] = [];
    const got = input.invoices.map((i) => `${i.customerCode} ${i.amount} ${i.pages}`).join(",");
    if (got !== "HLAM 50000 2,HOMS-J 12345 2,HLAO 7000 2,HOMT 1234567 2") failures.push(`unexpected invoices/pages: ${got}`);
    if (input.issueCheck !== "ok") failures.push(`the issue route would refuse the request: ${input.issueCheck}`);
    // r3: fixtures without the detail tables made every task warn "no second page" - a complete sheet warns of nothing.
    if (input.parsed?.warnings.length) failures.push(`unexpected warnings: ${input.parsed.warnings.join(" / ")}`);
    return failures;
  },
};
export default task;
