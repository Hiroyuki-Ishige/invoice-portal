import { makeWorkbook, patentSheets } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/**
 * From 2026/11 R&D (New Business) is no longer claimed separately, so its block (columns R-W of
 * 請求_研究) may be deleted. The workbook must still be read: R&D and the patents are issued, and a
 * warning says there is no R&D (New Business) invoice. Before the fix, the whole workbook was refused
 * with "Expected 2 "Claim to:" labels ... Remove the extra ones" (reported 2026-11-26). Figures made up.
 */
const task: EvalTask = {
  name: "patent-no-nb-block",
  kind: "patent-rd",
  firstSequence: 701,
  // The acceptance criteria a machine can decide (task.md); the grader keeps the wording.
  expect: {
    "2026-11": {
      invoices: [
        "HYM1AC2026-701 HOMT 880000 INVOICE 2p | Monthly fee for delegation of technology development",
        "HYM1AC2026-702 HOGV 210000 INVOICE 2p | Monthly fee for patent administration",
        "HYM1AC2026-703 HLAO 52500 DEBIT NOTE 2p | Monthly fee for patent administration",
        "HYM1AC2026-704 HOGV 1050 INVOICE 2p | Monthly fee for patent administration (New Business)",
      ],
      date: "30-Nov-2026",
      warnings: ["no R&D (New Business) block"],
      notices: 3,
      pdfContains: { "HYM1AC2026-701": ["= 1.1", "¥800,000", "Sample Lab A"] },
    },
    // /cp review 2026-11-26: with only the New Business block left, it must not be read as R&D.
    "only-nb-left": { error: "has only the R&D (New Business) block" },
  },
  inputs: async () => {
    const { rd, patent } = patentSheets({ year: 2026, month: 11 }, {
      rd: 880000,
      rdNb: 0,
      rdFactor: 1.1,
      patent: [["HOGV", 210000], ["HLAO", 52500]],
      patentNb: [["HOGV", 1050]],
    });
    // The New Business block deleted: every cell in columns R to W (the print filter in Y stays).
    const withoutNb = Object.fromEntries(Object.entries(rd).filter(([ref]) => !/^[R-W]\d+$/.test(ref)));
    // The other way round: the R&D block (columns C-H) deleted, New Business left.
    const onlyNb = Object.fromEntries(Object.entries(rd).filter(([ref]) => !/^[C-H]\d+$/.test(ref)));
    return [
      { label: "2026-11", file: await makeWorkbook({ 請求_研究: withoutNb, 請求_特許: patent }) },
      { label: "only-nb-left", file: await makeWorkbook({ 請求_研究: onlyNb, 請求_特許: patent }) },
    ];
  },
};
export default task;
