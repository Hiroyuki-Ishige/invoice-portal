import { makeWorkbook, patentSheets } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";
import type { ParsedPatentRd } from "../../../src/lib/invoice/patent-sheet";

/**
 * The Patent & R&D workbook with a **negative** R&D (New Business) claim, as reported 2026-11-26
 * (the real figure is not used - every figure here is made up). The negative must not stop the
 * other documents of the month.
 */

const task: EvalTask = {
  name: "patent-negative",
  kind: "patent-rd",
  firstSequence: 201,
  // The acceptance criteria a machine can decide (task.md); the grader keeps the wording.
  expect: {
    "2026-09": {
      invoices: [
        "HYM1AC2026-201 HOMT 1500000 INVOICE 2p | Monthly fee for delegation of technology development",
        "HYM1AC2026-202 HOGV 300000 INVOICE 2p | Monthly fee for patent administration",
        "HYM1AC2026-203 HLAO 45000 DEBIT NOTE 2p | Monthly fee for patent administration",
        "HYM1AC2026-204 HOGV 12000 INVOICE 2p | Monthly fee for patent administration (New Business)",
      ],
      date: "30-Sep-2026",
      warnings: [
        "-98,765",
        "S4",
      ],
      notices: 3,
    },
  },
  inputs: async () => [
    {
      label: "2026-09",
      file: await makeWorkbook({
        ...(() => {
          const { rd, patent } = patentSheets({ year: 2026, month: 9 }, {
            rd: 1500000,
            rdNb: -98765,
            patent: [["HOGV", 300000], ["HOGV2", 0], ["HLAO", 45000]],
            patentNb: [["HOGV", 12000]],
          });
          return { 請求_研究: rd, 請求_特許: patent };
        })(),
      }),
    },
  ],
  checks: (result) => {
    const failures: string[] = [];
    const input = result.inputs[0];
    if (input.error) return [`a negative claim refused the whole workbook again: ${input.error}`];
    const parsed = input.parsed as ParsedPatentRd;
    if (parsed.lines.some((l) => l.amount <= 0)) failures.push("a line with an amount of 0 or less was kept");
    if (!parsed.warnings.some((w) => w.includes("-98,765") && w.includes("S4")))
      failures.push("no warning names the negative amount (-98,765) and its cell (S4)");
    if (parsed.checks.some((c) => c.sum !== c.sheetTotal)) failures.push("the patent totals no longer match the sheet");
    if (input.invoices.length !== 4) failures.push(`expected 4 invoices, got ${input.invoices.length}`);
    return failures;
  },
};
export default task;
