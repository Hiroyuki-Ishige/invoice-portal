import type { ParsedClaim } from "../../src/lib/invoice/claim-sheet";
import type { ParsedPatentRd } from "../../src/lib/invoice/patent-sheet";
import type { TaskExpect } from "./expect";
import type { ParsedRdReimbursement } from "../../src/lib/invoice/rd-reimbursement-sheet";

export interface EvalTask {
  name: string;
  /** Which screen's workbook this is - also which of the customer's default titles applies. */
  kind: "expense" | "patent-rd";
  /** The made-up workbooks, run in this order. Running numbers carry on from one to the next within a fiscal year. */
  inputs: () => Promise<Array<{ label: string; file: ArrayBuffer }>>;
  /** The running number the first invoice of each fiscal year takes. */
  firstSequence: number;
  /**
   * Mechanical checks, one per failure that was fixed (the regression net). Each returns the ones
   * that failed, in words. The grader judges `task.md`; these only stop a fixed failure coming back.
   */
  checks?: (result: TaskResult) => string[];
  /** The task's acceptance criteria a machine can decide (`lib/expect.ts`), by input label. */
  expect?: TaskExpect;
}

export interface IssuedInvoice {
  number: string;
  title: string;
  customerCode: string;
  customerName: string;
  invoiceDate: string;
  monthLabel: string;
  amount: number;
  description: string;
  pdfFile: string;
  textFile: string;
  /** Pages in the PDF: 2 when the invoice carries its statement. */
  pages: number;
  /** Which page 2 it carries (`statement-record.ts`), or `null` for a one-page invoice. */
  statementLayout: string | null;
}

export interface InputResult {
  label: string;
  /** The reader's refusal, when it refused the workbook. */
  error: string | null;
  parsed: ParsedClaim | ParsedPatentRd | null;
  /** The expenses workbook's `請求_立替研究` sheet, when it has one with something to claim. */
  rd: ParsedRdReimbursement | null;
  invoices: IssuedInvoice[];
  /** Codes read from the sheet with no customer in the master: no invoice, no number taken. */
  unregistered: string[];
  notices: Array<{ customerCode: string; subject: string; htmlFile: string }>;
  /** What the issue route's own check (`validateIssueRequest`) said of the request: `"ok"`, or its error. `null` when nothing was issued. */
  issueCheck: string | null;
}

export interface TaskResult {
  task: string;
  inputs: InputResult[];
  ms: number;
  checkFailures: string[];
}
