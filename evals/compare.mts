/**
 * Compare two rounds of `run.mts`, task by task, without calling a model:
 *
 *   npx tsx evals/compare.mts <previous round> <this round> [task ...]
 *
 * A task whose output is the same as in the previous round needs no grader (`/eval-loop`): its
 * grade carries over. "The same" is: the reader's refusal, the lines and warnings it read, the
 * codes with no customer, each invoice's fields, the text of every PDF page and every notice.
 * Exit code 1 when anything differs, so a difference cannot be read past.
 *
 * A round written before page markers existed (r2 and earlier, one page per invoice) is compared
 * on page 1 only; the pages that round never had are reported, not counted as differences.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InputResult, TaskResult } from "./lib/types";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const FIELDS = ["number", "title", "customerCode", "customerName", "invoiceDate", "monthLabel", "amount", "description", "pages", "statementLayout"] as const;

/** A PDF's text as pages: `--- page N ---` markers since r3, one page before. */
function pagesOf(text: string): string[] {
  if (!text.startsWith("--- page 1 ---")) return [text.trim()];
  return text.split(/\n*--- page \d+ ---\n/).slice(1).map((p) => p.trim());
}

const read = (round: string, task: string, file: string) => readFileSync(path.join(OUT, round, task, file), "utf8");
const json = (v: unknown) => JSON.stringify(v ?? null);

function compareTask(prev: string, cur: string, task: string): { diffs: string[]; notes: string[] } {
  const diffs: string[] = [];
  const notes: string[] = [];
  const a = JSON.parse(read(prev, task, "result.json")) as TaskResult;
  const b = JSON.parse(read(cur, task, "result.json")) as TaskResult;
  if (a.inputs.length !== b.inputs.length) diffs.push(`inputs ${a.inputs.length} -> ${b.inputs.length}`);

  a.inputs.forEach((ia: InputResult, i) => {
    const ib = b.inputs[i];
    if (!ib) return;
    const at = (s: string) => `${ib.label}: ${s}`;
    if (ia.error !== ib.error) diffs.push(at(`error ${json(ia.error)} -> ${json(ib.error)}`));
    const lines = (r: InputResult) => json(r.parsed?.lines.map((l) => [l.claimTo, l.amount, "kind" in l ? l.kind : null]));
    if (lines(ia) !== lines(ib)) diffs.push(at(`lines ${lines(ia)} -> ${lines(ib)}`));
    if (json(ia.parsed?.warnings) !== json(ib.parsed?.warnings)) diffs.push(at(`warnings ${json(ia.parsed?.warnings)} -> ${json(ib.parsed?.warnings)}`));
    if (json(ia.unregistered) !== json(ib.unregistered)) diffs.push(at(`unregistered ${json(ia.unregistered)} -> ${json(ib.unregistered)}`));
    if ("issueCheck" in ia && ia.issueCheck !== ib.issueCheck) diffs.push(at(`issueCheck ${json(ia.issueCheck)} -> ${json(ib.issueCheck)}`));
    if (ia.invoices.length !== ib.invoices.length) diffs.push(at(`invoices ${ia.invoices.length} -> ${ib.invoices.length}`));

    ia.invoices.forEach((x, k) => {
      const y = ib.invoices[k];
      if (!y) return;
      for (const f of FIELDS) {
        if (f in x && json(x[f]) !== json(y[f])) diffs.push(at(`${x.number}.${f} ${json(x[f])} -> ${json(y[f])}`));
      }
      const pa = pagesOf(read(prev, task, x.textFile));
      const pb = pagesOf(read(cur, task, y.textFile));
      pa.forEach((p, n) => {
        if (p !== pb[n]) diffs.push(at(`${x.number} page ${n + 1} text differs`));
      });
      if (pb.length > pa.length) notes.push(at(`${y.number} has ${pb.length - pa.length} page(s) the previous round did not`));
    });

    for (const na of ia.notices) {
      const nb = ib.notices.find((n) => n.customerCode === na.customerCode);
      if (!nb) diffs.push(at(`notice for ${na.customerCode} missing`));
      else if (na.subject !== nb.subject || read(prev, task, na.htmlFile) !== read(cur, task, nb.htmlFile)) diffs.push(at(`notice for ${na.customerCode} differs`));
    }
    if (ib.notices.length !== ia.notices.length) diffs.push(at(`notices ${ia.notices.length} -> ${ib.notices.length}`));
  });
  return { diffs, notes };
}

function main() {
  const [prev, cur, ...only] = process.argv.slice(2);
  if (!prev || !cur) {
    console.error("usage: npx tsx evals/compare.mts <previous round> <this round> [task ...]");
    process.exit(2);
  }
  const tasks = readdirSync(path.join(OUT, cur)).filter((t) => !only.length || only.includes(t)).sort();
  let differing = 0;
  for (const task of tasks) {
    if (!existsSync(path.join(OUT, prev, task, "result.json"))) {
      console.log(`${task}: new (not in ${prev}) - grade it`);
      continue;
    }
    const { diffs, notes } = compareTask(prev, cur, task);
    if (diffs.length) differing++;
    console.log(`${task}: ${diffs.length ? `DIFFERS (${diffs.length}) - grade it` : "same"}`);
    for (const d of diffs) console.log(`  - ${d}`);
    for (const n of notes) console.log(`  note: ${n}`);
  }
  process.exitCode = differing ? 1 : 0;
}

main();
