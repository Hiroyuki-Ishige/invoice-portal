/**
 * Run the eval tasks: make each made-up workbook, put it through the app's own code
 * (Excel reader -> number and date -> PDF -> completion notice) and write what came out to
 * `evals/out/<round>/<task>/` for the grader.
 *
 *   npx tsx evals/run.mts [round] [task ...]
 *
 * **Nothing here talks to Dataverse or Microsoft Graph**: `.env.local` is not read, `sequence.ts`,
 * the Dataverse client and `send-mail` are not imported. Running numbers are fixed per task and
 * formatted with `invoiceNumberFor`; the notice is built, never sent.
 *
 * What mirrors a screen rather than calling it - the invoice date defaulting to the last day of the
 * claim month, a code with no customer making no invoice and taking no number, the customer's
 * default title, the expenses workbook's optional `請求_立替研究` row after the expense rows (a problem in
 * that sheet is a warning, not a refusal of the expenses), each invoice's page 2 - is the rule `/invoices`
 * and `/invoices/patent-rd` apply, written once here. The request the screen would POST is put through
 * `validateIssueRequest` (what the issue route checks before it saves anything): that is "issuing"
 * without Dataverse.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ClaimSheetError, parseClaimSheet, statementFor } from "../src/lib/invoice/claim-sheet";
import { parsePatentRdWorkbook } from "../src/lib/invoice/patent-sheet";
import { RD_DESCRIPTION, parseRdReimbursementSheet, type ParsedRdReimbursement } from "../src/lib/invoice/rd-reimbursement-sheet";
import { validateIssueRequest } from "../src/lib/invoice/invoice-record";
import type { Statement } from "../src/lib/invoice/statement-record";
import { buildInvoicePdf } from "../src/lib/invoice/build-pdf";
import { invoiceNumberFor } from "../src/lib/invoice/invoice-number";
import { fiscalYearOf, formatInvoiceDate, formatMonthLabel, lastDayOfMonth, toDateInput } from "../src/lib/invoice/dates";
import { buildInvoiceNotice } from "../src/lib/notify/invoice-notice";
import type { Customer } from "../src/lib/invoice/customer-record";
import { EVAL_CUSTOMERS } from "./lib/fixtures";
import type { EvalTask, InputResult, IssuedInvoice, TaskResult } from "./lib/types";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/** What `/invoices` prints in the Description column (the constant in `src/app/invoices/page.tsx`). */
const EXPENSE_DESCRIPTION = "Reimbursement for the expense";

/** One document the screen would issue - an expense row, the R&D reimbursement row, or a Patent & R&D row. */
interface Item {
  claimTo: string;
  amount: number;
  description: string;
  statement: Statement | null;
}

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += (line && item.str ? " " : "") + item.str;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.filter(Boolean).join("\n"));
  }
  // Pages are marked so the grader can tell page 1 (the invoice) from page 2 (the statement).
  return { text: pages.map((p, i) => `--- page ${i + 1} ---\n${p}`).join("\n\n"), pages: doc.numPages };
}

async function runTask(task: EvalTask, outDir: string, logoPng: Uint8Array): Promise<TaskResult> {
  const started = Date.now();
  const customerByCode = new Map<string, Customer>(EVAL_CUSTOMERS.map((c) => [c.code.toLowerCase(), c]));
  const nextSequence = new Map<number, number>();
  const inputs: InputResult[] = [];
  await mkdir(outDir, { recursive: true });

  for (const input of await task.inputs()) {
    const result: InputResult = { label: input.label, error: null, parsed: null, rd: null, invoices: [], unregistered: [], notices: [], issueCheck: null };
    inputs.push(result);
    await writeFile(path.join(outDir, `${input.label}.xlsx`), new Uint8Array(input.file));
    let parsed;
    let rd: ParsedRdReimbursement | null = null;
    try {
      parsed = task.kind === "expense" ? await parseClaimSheet(input.file) : await parsePatentRdWorkbook(input.file);
      if (task.kind === "expense") {
        // As /invoices: the R&D reimbursement sheet is optional, and its problem does not stop the expenses.
        try {
          rd = await parseRdReimbursementSheet(input.file);
        } catch (e) {
          if (!(e instanceof ClaimSheetError)) throw e;
          parsed.warnings.push(`${e.message} The R&D reimbursement invoice is not made until this is fixed.`);
        }
      }
    } catch (e) {
      result.error = `${(e as Error).constructor.name}: ${(e as Error).message}`;
      continue;
    }
    result.parsed = parsed;
    result.rd = rd;
    const claim = parsed;
    const items: Item[] =
      "description" in (parsed.lines[0] ?? {}) || task.kind === "patent-rd"
        ? (parsed.lines as Array<Item & { statement?: Statement }>).map((l) => ({ ...l, statement: l.statement ?? null }))
        : [
            ...parsed.lines.map((l) => ({
              claimTo: l.claimTo,
              amount: l.amount,
              description: EXPENSE_DESCRIPTION,
              statement: "statement" in claim && claim.statement ? statementFor(claim.statement, l) : null,
            })),
            ...(rd ? [{ claimTo: rd.claimTo, amount: rd.amount, description: RD_DESCRIPTION, statement: rd.statement }] : []),
          ];

    const date = lastDayOfMonth(parsed.claimMonth);
    const fiscalYear = fiscalYearOf(date);
    const monthLabel = formatMonthLabel(parsed.claimMonth);
    const posted: Array<{ claimTo: string; title: string; description: string; amount: number; statement?: Statement }> = [];
    for (const line of items) {
      const customer = customerByCode.get(line.claimTo.toLowerCase());
      if (!customer) {
        result.unregistered.push(line.claimTo);
        continue;
      }
      const sequence = nextSequence.get(fiscalYear) ?? task.firstSequence;
      nextSequence.set(fiscalYear, sequence + 1);
      const number = invoiceNumberFor(date, sequence);
      const description = line.description;
      const title = customer.defaultTitles[task.kind];
      posted.push({ claimTo: line.claimTo, title, description, amount: line.amount, ...(line.statement ? { statement: line.statement } : {}) });
      const bytes = await buildInvoicePdf({
        title,
        invoiceNumber: number,
        invoiceDate: formatInvoiceDate(date),
        customer: { name: customer.name, addressLines: customer.addressLines, tradingPartnerId: customer.tradingPartnerId },
        paymentTerms: customer.paymentTerms,
        description,
        monthLabel,
        amount: line.amount,
        logoPng,
        statement: line.statement,
      });
      const pdfFile = `${input.label}-${number}.pdf`;
      await writeFile(path.join(outDir, pdfFile), bytes);
      const textFile = `${input.label}-${number}.txt`;
      const { text, pages } = await pdfText(bytes);
      await writeFile(path.join(outDir, textFile), text);
      const issued: IssuedInvoice = {
        number,
        title,
        customerCode: customer.code,
        customerName: customer.name,
        invoiceDate: formatInvoiceDate(date),
        monthLabel,
        amount: line.amount,
        description,
        pdfFile,
        textFile,
        pages,
        statementLayout: line.statement?.layout ?? null,
      };
      result.invoices.push(issued);
    }

    // Issuing: the request the screen would POST, as JSON, through the route's own check.
    if (posted.length > 0) {
      const checked = validateIssueRequest(JSON.parse(JSON.stringify({ invoiceDate: toDateInput(date), monthLabel, items: posted })));
      result.issueCheck = checked.ok ? "ok" : checked.error;
    }

    // One notice per company, as `NotifyPanel` sends them.
    const byCustomer = new Map<string, IssuedInvoice[]>();
    for (const inv of result.invoices) byCustomer.set(inv.customerCode, [...(byCustomer.get(inv.customerCode) ?? []), inv]);
    for (const [code, list] of byCustomer) {
      const notice = buildInvoiceNotice({
        customerName: list[0].customerName,
        invoiceDate: toDateInput(date),
        monthLabel,
        invoices: list.map((i) => ({ number: i.number, title: i.title, description: i.description, amount: i.amount })),
        attached: true,
        senderName: "Eval Runner",
        origin: "https://example.invalid",
      });
      const htmlFile = `${input.label}-notice-${code}.html`;
      await writeFile(path.join(outDir, htmlFile), notice.html);
      result.notices.push({ customerCode: code, subject: notice.subject, htmlFile });
    }
  }

  const taskResult: TaskResult = { task: task.name, inputs, ms: Date.now() - started, checkFailures: [] };
  taskResult.checkFailures = task.checks ? task.checks(taskResult) : [];
  await writeFile(path.join(outDir, "result.json"), JSON.stringify(taskResult, null, 2));
  return taskResult;
}

async function main() {
  const [roundArg, ...only] = process.argv.slice(2);
  const round = roundArg || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logoPng = new Uint8Array(await readFile(path.join(ROOT, "..", "public", "hoya-logo.png")));
  const names = (await readdir(path.join(ROOT, "tasks"))).filter((n) => !only.length || only.includes(n)).sort();

  let failed = 0;
  for (const name of names) {
    const modulePath = path.join(ROOT, "tasks", name, "task.ts");
    if (!existsSync(modulePath)) continue;
    const task = (await import(pathToFileURL(modulePath).href)).default as EvalTask;
    const result = await runTask(task, path.join(ROOT, "out", round, name), logoPng);
    const errors = result.inputs.filter((i) => i.error).length;
    const invoices = result.inputs.reduce((a, i) => a + i.invoices.length, 0);
    console.log(
      `${name}: ${invoices} invoice(s), ${errors} read error(s), ${result.checkFailures.length} check failure(s), ${result.ms} ms`
    );
    for (const f of result.checkFailures) console.log(`  CHECK FAILED: ${f}`);
    failed += result.checkFailures.length;
  }
  console.log(`round ${round} -> evals/out/${round}/`);
  process.exitCode = failed ? 1 : 0;
}

main();
