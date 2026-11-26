import { claimSheet, makeWorkbook } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/**
 * Where the name alone cannot tell which sheet is meant, nothing is guessed. Two copies with
 * different figures and no exact name must be refused; with the exact name present, it wins. Figures made up.
 */
const copy = (amount: number) => claimSheet({ year: 2026, month: 10 }, [["HLAM", amount]], amount);
const task: EvalTask = {
  name: "sheet-name-ambiguous",
  kind: "expense",
  firstSequence: 1,
  inputs: async () => [
    { label: "two-copies", file: await makeWorkbook({ "請求_出向者立替費用 (2)": copy(11111), "請求_出向者立替費用 (3)": copy(22222) }) },
    { label: "exact-wins", file: await makeWorkbook({ "請求_出向者立替費用 (2)": copy(11111), 請求_出向者立替費用: copy(33333) }) },
  ],
  checks: (result) => {
    const [two, exact] = result.inputs;
    const failures: string[] = [];
    if (!two.error || two.invoices.length) failures.push("two-copies: two candidate sheets were not refused");
    if (exact.error || exact.invoices.map((i) => i.amount).join() !== "33333") failures.push("exact-wins: the exact sheet was not the one read");
    return failures;
  },
};
export default task;
