/**
 * **The running invoice number, handed out without ever giving the same one twice** (server only).
 *
 * One row per fiscal year in `hi_invoicesequence` holds the last number used. To take `count`
 * numbers, the row is read with its `@odata.etag` and written back with `If-Match`: if somebody
 * else took numbers in between, Dataverse answers 412 and the whole read-and-write is tried
 * again (rule 27). The unique key on the invoice number is the second line of defence.
 *
 * **A number taken and then not used is a gap, not a reuse.** If saving the invoice fails after
 * the number was taken, that number stays taken. Gaps are tolerated, duplicates are not.
 *
 * A year with no row yet is started automatically only when the year before has one - the
 * system is in use, and April simply rolled over. The very first row (or a year the app has
 * never numbered) must be set by an administrator in Admin > Setup, because invoices issued
 * before this app existed (by hand, up to a number the app cannot know) would otherwise be
 * numbered over.
 */

import {
  DataverseError,
  createDataverseRecord,
  deleteDataverseRecord,
  queryDataverseAll,
  updateDataverseRecord,
} from "@/lib/providers/dataverse/client";
import { MAX_SEQUENCE, SEQUENCE_ENTITY_SET, SEQUENCE_FIELDS } from "./invoice-record";

const MAX_ATTEMPTS = 6;

export class SequenceError extends Error {
  constructor(
    message: string,
    readonly code: "not_started" | "exhausted" | "busy"
  ) {
    super(message);
    this.name = "SequenceError";
  }
}

interface SequenceRow {
  id: string;
  etag: string | null;
  fiscalYear: number;
  last: number;
  createdOn: string;
}

function toRow(record: Record<string, unknown>): SequenceRow {
  const etag = record["@odata.etag"];
  return {
    id: String(record[SEQUENCE_FIELDS.id] ?? ""),
    etag: typeof etag === "string" ? etag : null,
    fiscalYear: Number(record[SEQUENCE_FIELDS.fiscalYear] ?? 0),
    last: Number(record[SEQUENCE_FIELDS.lastSequence] ?? 0),
    createdOn: String(record.createdon ?? ""),
  };
}

async function readRows(token: string, fiscalYear: number): Promise<SequenceRow[]> {
  const records = await queryDataverseAll<Record<string, unknown>>(token, SEQUENCE_ENTITY_SET, {
    filter: `${SEQUENCE_FIELDS.fiscalYear} eq ${Math.trunc(fiscalYear)}`,
    orderby: "createdon asc",
  });
  return records.map(toRow);
}

/** Every year that has a row, newest first - what Admin > Setup shows. */
export async function listSequences(token: string): Promise<Array<{ fiscalYear: number; last: number }>> {
  const records = await queryDataverseAll<Record<string, unknown>>(token, SEQUENCE_ENTITY_SET, {
    orderby: `${SEQUENCE_FIELDS.fiscalYear} desc`,
  });
  return records.map(toRow).map(({ fiscalYear, last }) => ({ fiscalYear, last }));
}

/** The last number used in a year, or `null` when the year has not been started. */
export async function readLastSequence(token: string, fiscalYear: number): Promise<number | null> {
  const rows = await readRows(token, fiscalYear);
  return rows.length === 0 ? null : rows[0].last;
}

async function createRow(token: string, fiscalYear: number, last: number): Promise<void> {
  const created = toRow(
    await createDataverseRecord<Record<string, unknown>>(token, SEQUENCE_ENTITY_SET, {
      [SEQUENCE_FIELDS.name]: `FY${fiscalYear}`,
      [SEQUENCE_FIELDS.fiscalYear]: fiscalYear,
      [SEQUENCE_FIELDS.lastSequence]: last,
    })
  );
  // Two people starting the same year at once would leave two rows; the later one steps aside.
  const rows = await readRows(token, fiscalYear);
  if (rows.length > 1 && rows[0].id !== created.id) {
    await deleteDataverseRecord(token, SEQUENCE_ENTITY_SET, created.id).catch(() => undefined);
  }
}

/**
 * Administrator action: set the last number used in a year (creating the year's row if needed).
 * Never goes backwards - lowering it could hand out a number that was already issued.
 */
export async function setLastSequence(token: string, fiscalYear: number, last: number): Promise<void> {
  if (!Number.isInteger(last) || last < 0 || last > MAX_SEQUENCE) {
    throw new SequenceError(`The number must be between 0 and ${MAX_SEQUENCE}.`, "exhausted");
  }
  const rows = await readRows(token, fiscalYear);
  if (rows.length === 0) {
    await createRow(token, fiscalYear, last);
    return;
  }
  if (last < rows[0].last) {
    throw new SequenceError(
      `FY${fiscalYear} has already reached ${rows[0].last}. The number cannot be lowered, or a number already issued could be handed out again.`,
      "exhausted"
    );
  }
  await updateDataverseRecord(token, SEQUENCE_ENTITY_SET, rows[0].id, { [SEQUENCE_FIELDS.lastSequence]: last }, rows[0].etag ?? "*");
}

/**
 * Take `count` consecutive numbers in a fiscal year and return the first.
 * The caller then uses `first .. first + count - 1`.
 */
export async function takeNumbers(token: string, fiscalYear: number, count: number): Promise<number> {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rows = await readRows(token, fiscalYear);

    if (rows.length === 0) {
      const previous = await readRows(token, fiscalYear - 1);
      if (previous.length === 0) {
        throw new SequenceError(
          `No starting number is set for FY${fiscalYear}. An administrator sets it in Admin > Setup (Invoice numbers).`,
          "not_started"
        );
      }
      await createRow(token, fiscalYear, 0);
      continue;
    }

    const row = rows[0];
    const next = row.last + count;
    if (next > MAX_SEQUENCE) {
      throw new SequenceError(
        `FY${fiscalYear} has ${MAX_SEQUENCE - row.last} numbers left, and ${count} are needed.`,
        "exhausted"
      );
    }
    try {
      // Without an etag the write would not be conditional - and then it is not safe to retry.
      if (!row.etag) throw new SequenceError("The number could not be reserved safely.", "busy");
      await updateDataverseRecord(token, SEQUENCE_ENTITY_SET, row.id, { [SEQUENCE_FIELDS.lastSequence]: next }, row.etag);
      return row.last + 1;
    } catch (error) {
      // 412: somebody else took numbers since the read. Read again and retry.
      if (error instanceof DataverseError && error.status === 412) continue;
      throw error;
    }
  }
  throw new SequenceError("Another invoice was being issued at the same time. Please try again.", "busy");
}
