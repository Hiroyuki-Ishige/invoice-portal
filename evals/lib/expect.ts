/**
 * The acceptance criteria a machine can decide, so they are decided on every run (the pre-commit
 * hook included) and not only when a grader is called. The grader keeps what needs judgement -
 * whether a sentence says what it should, in English.
 *
 * - `commonChecks`: the rules every task shares (CLAUDE.md): number format and fiscal year, no
 *   invoice from 0, amounts with thousands separators, no Japanese in the PDF or the notice, and the
 *   issue route accepting what would be posted.
 * - `expectChecks`: a task's own figures, written in its `task.ts` as `expect`.
 */
import { formatAmount } from "../../src/lib/utils/format";
import type { InputResult, IssuedInvoice, TaskResult } from "./types";

export interface InputExpect {
  /** Part of the reader's refusal. Set, nothing may be issued from this input. */
  error?: string;
  /**
   * Every invoice, in order: `"HYM1AC2026-201 HLAM 50000 INVOICE 2p | Reimbursement for the expense"`
   * (number, code, amount, title, pages, description).
   */
  invoices?: string[];
  /** The invoice date every invoice prints: `"31-Oct-2026"`. */
  date?: string;
  /** Each must be part of some warning. `[]`: no warning at all. */
  warnings?: string[];
  /** Codes read with no customer. */
  unregistered?: string[];
  /** Notices, one per company. */
  notices?: number;
  /** Every notice subject starts with this (e.g. `[TEST]` while NOTICE_TEST_MODE is on). */
  noticeSubjectPrefix?: string;
  /** By invoice number: text that must be in that PDF (page 2 included), and text that must not. */
  pdfContains?: Record<string, string[]>;
  pdfNotContains?: Record<string, string[]>;
}

/** By input label. */
export type TaskExpect = Record<string, InputExpect>;

type Read = (file: string) => string;

const JAPANESE = /[　-ヿ㐀-鿿＀-￯]/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `31-Oct-2026` -> 2026; `31-Mar-2026` -> 2025 (the fiscal year starts on 1 April). */
function fiscalYearOfPrinted(date: string): number | null {
  const m = /^\d{2}-([A-Z][a-z]{2})-(\d{4})$/.exec(date);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  return month >= 4 ? Number(m[2]) : Number(m[2]) - 1;
}

const line = (i: IssuedInvoice) => `${i.number} ${i.customerCode} ${i.amount} ${i.title} ${i.pages}p | ${i.description}`;

export function commonChecks(result: TaskResult, read: Read): string[] {
  const failures: string[] = [];
  for (const input of result.inputs) {
    const at = (s: string) => `${input.label}: ${s}`;
    for (const inv of input.invoices) {
      const m = /^HYM1AC(\d{4})-(\d{3})$/.exec(inv.number);
      if (!m) failures.push(at(`${inv.number} is not HYM1AC{fiscal year}-{3 digits}`));
      else if (Number(m[1]) !== fiscalYearOfPrinted(inv.invoiceDate)) failures.push(at(`${inv.number} is not in the fiscal year of ${inv.invoiceDate}`));
      if (!(inv.amount > 0)) failures.push(at(`${inv.number} was made from an amount of ${inv.amount}`));
      const text = read(inv.textFile);
      if (!text.includes(formatAmount(inv.amount, 0))) failures.push(at(`${inv.number}: the PDF does not print ${formatAmount(inv.amount, 0)}`));
      if (inv.amount >= 1000 && new RegExp(`(?<![\\d,])${inv.amount}(?![\\d,])`).test(text)) {
        failures.push(at(`${inv.number}: the PDF prints ${inv.amount} without separators`));
      }
      if (JAPANESE.test(text)) failures.push(at(`${inv.number}: the PDF text has Japanese characters`));
    }
    for (const n of input.notices) {
      if (JAPANESE.test(read(n.htmlFile))) failures.push(at(`the notice to ${n.customerCode} has Japanese characters`));
    }
    if (input.invoices.length > 0 && input.issueCheck !== "ok") failures.push(at(`the issue route would refuse the request: ${input.issueCheck}`));
  }
  return failures;
}

export function expectChecks(result: TaskResult, expect: TaskExpect, read: Read): string[] {
  const failures: string[] = [];
  for (const [label, want] of Object.entries(expect)) {
    const input: InputResult | undefined = result.inputs.find((i) => i.label === label);
    const at = (s: string) => `${label}: ${s}`;
    if (!input) {
      failures.push(at("no such input"));
      continue;
    }
    if (want.error !== undefined) {
      if (!input.error?.includes(want.error)) failures.push(at(`expected a refusal with "${want.error}", got ${input.error ?? "none"}`));
      if (input.invoices.length) failures.push(at(`refused, yet ${input.invoices.length} invoice(s) were made`));
    } else if (input.error) {
      failures.push(at(`refused: ${input.error}`));
    }
    if (want.invoices) {
      const got = input.invoices.map(line);
      if (got.join("\n") !== want.invoices.join("\n")) failures.push(at(`invoices\n      expected: ${want.invoices.join("\n                ")}\n      got:      ${got.join("\n                ")}`));
    }
    if (want.date) {
      const off = input.invoices.filter((i) => i.invoiceDate !== want.date).map((i) => `${i.number} ${i.invoiceDate}`);
      if (off.length) failures.push(at(`dates other than ${want.date}: ${off.join(", ")}`));
    }
    if (want.warnings) {
      const warnings = input.parsed?.warnings ?? [];
      if (want.warnings.length === 0 && warnings.length) failures.push(at(`unexpected warnings: ${warnings.join(" / ")}`));
      for (const w of want.warnings) if (!warnings.some((x) => x.includes(w))) failures.push(at(`no warning with "${w}"`));
    }
    if (want.unregistered && input.unregistered.join(",") !== want.unregistered.join(",")) {
      failures.push(at(`unregistered ${input.unregistered.join(",") || "none"}, expected ${want.unregistered.join(",") || "none"}`));
    }
    if (want.notices !== undefined && input.notices.length !== want.notices) failures.push(at(`${input.notices.length} notices, expected ${want.notices}`));
    if (want.noticeSubjectPrefix) {
      for (const n of input.notices) if (!n.subject.startsWith(want.noticeSubjectPrefix)) failures.push(at(`notice subject "${n.subject}" does not start with ${want.noticeSubjectPrefix}`));
    }
    const textOf = (number: string) => {
      const inv = input.invoices.find((i) => i.number === number);
      return inv ? read(inv.textFile) : null;
    };
    for (const [number, parts] of Object.entries(want.pdfContains ?? {})) {
      const text = textOf(number);
      if (text === null) failures.push(at(`no invoice ${number}`));
      else for (const p of parts) if (!text.includes(p)) failures.push(at(`${number}: the PDF does not have "${p}"`));
    }
    for (const [number, parts] of Object.entries(want.pdfNotContains ?? {})) {
      const text = textOf(number);
      if (text !== null) for (const p of parts) if (text.includes(p)) failures.push(at(`${number}: the PDF has "${p}", which it must not`));
    }
  }
  return failures;
}
