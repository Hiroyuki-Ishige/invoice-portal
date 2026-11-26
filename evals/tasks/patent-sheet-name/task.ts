import { makeWorkbook, patentSheets } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** Both Patent & R&D sheets under slightly different names. Figures made up. */
const task: EvalTask = {
  name: "patent-sheet-name",
  kind: "patent-rd",
  firstSequence: 401,
  inputs: async () => {
    const { rd, patent } = patentSheets({ year: 2027, month: 1 }, {
      rd: 700000,
      rdNb: 0,
      patent: [["HOGV", 50000]],
      patentNb: [["HOGV", 0]],
    });
    return [{ label: "2027-01", file: await makeWorkbook({ "請求-研究 (FY2026)": rd, "請求_特許 ": patent }) }];
  },
  checks: (result) => (result.inputs[0].error ? [`refused: ${result.inputs[0].error}`] : []),
};
export default task;
