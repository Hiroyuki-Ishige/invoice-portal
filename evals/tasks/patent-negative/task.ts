import { makeWorkbook, month } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";
import type { ParsedPatentRd } from "../../../src/lib/invoice/patent-sheet";

/**
 * The Patent & R&D workbook with a **negative** R&D (New Business) claim, as reported 2026-11-26
 * (the real figure is not used - every figure here is made up). The negative must not stop the
 * other documents of the month.
 */
const claimMonth = month(2026, 9);

const task: EvalTask = {
  name: "patent-negative",
  kind: "patent-rd",
  firstSequence: 201,
  inputs: async () => [
    {
      label: "2026-09",
      file: await makeWorkbook({
        請求_研究: {
          C1: "R&D supplies and outsourced work paid by EXAMPLE",
          C2: "Claim year/month:",
          D2: claimMonth,
          C3: "Claim to:",
          D3: "HOMT",
          C4: "Claim amount:",
          D4: 1500000,
          R1: "Research and Development Fees(New Business)",
          R2: "Claim year/month:",
          S2: claimMonth,
          R3: "Claim to:",
          S3: "HOMT",
          R4: "Claim amount:",
          S4: -98765,
        },
        請求_特許: {
          B2: "Claim year/month:",
          C2: claimMonth,
          B5: "Claim amount:",
          C6: "HOGV",
          D6: 300000,
          C7: "HOGV2",
          D7: 0,
          C8: "HLAO",
          D8: 45000,
          C9: "Total",
          D9: 345000,
          I5: "Claim amount:",
          J6: "HOGV",
          K6: 12000,
          J7: "Total",
          K7: 12000,
        },
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
