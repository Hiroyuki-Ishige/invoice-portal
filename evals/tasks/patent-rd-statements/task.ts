import { makeWorkbook, patentSheets } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/**
 * The Patent & R&D workbook with every table: R&D at 1.1 x its department table (a 非表示 zero row
 * left off), Patent and Patent (New Business) at 1.05 x each company's allocated part, one of them
 * 1 yen off the rounded part (as Excel rounds the unrounded share). Figures and names made up.
 */
const task: EvalTask = {
  name: "patent-rd-statements",
  kind: "patent-rd",
  firstSequence: 501,
  inputs: async () => {
    const { rd, patent } = patentSheets({ year: 2026, month: 11 }, {
      rd: 1100000,
      rdNb: 55000,
      rdFactor: 1.1,
      patent: [["HLAM", 0], ["HOGV", 420000], ["HOGV2", 315000], ["HLAO", 105000]],
      patentNb: [["HOGV", 2100], ["HOGV2", 0], ["HLAO", 1051]],
    });
    return [{ label: "2026-11", file: await makeWorkbook({ 請求_研究: rd, 請求_特許: patent }) }];
  },
  checks: (result) => {
    const input = result.inputs[0];
    if (input.error) return [`refused: ${input.error}`];
    const failures: string[] = [];
    if (input.invoices.length !== 7 || input.invoices.some((i) => i.pages !== 2)) {
      failures.push(`expected 7 two-page invoices, got ${input.invoices.map((i) => `${i.customerCode}:${i.pages}`).join(",")}`);
    }
    if (input.issueCheck !== "ok") failures.push(`the issue route would refuse the request: ${input.issueCheck}`);
    // r3: fixtures without the detail tables made every task warn "no second page" - a complete sheet warns of nothing.
    if (input.parsed?.warnings.length) failures.push(`unexpected warnings: ${input.parsed.warnings.join(" / ")}`);
    return failures;
  },
};
export default task;
