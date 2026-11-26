import { claimSheet, makeWorkbook } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** The same one-line sheet for March and for April: the fiscal year starts on 1 April. Figures made up. */
const sheet = (month: number) =>
  makeWorkbook({ 請求_出向者立替費用: claimSheet({ year: 2026, month }, [["HLAM", 10000]], 10000) });

const task: EvalTask = {
  name: "fiscal-boundary",
  kind: "expense",
  firstSequence: 1,
  inputs: async () => [
    { label: "2026-03", file: await sheet(3) },
    { label: "2026-04", file: await sheet(4) },
  ],
};
export default task;
