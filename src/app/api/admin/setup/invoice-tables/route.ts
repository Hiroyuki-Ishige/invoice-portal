/**
 * Admin Setup API - the invoice tables: `hi_invoice`, `hi_invoiceline`, `hi_invoicesequence`
 *
 * GET:  which tables exist, and which columns, relationship and key are missing
 * POST: create what is missing (tables, then columns, then the line -> invoice lookup, then the
 *       unique key on the invoice number). Safe to run again: only what is missing is added.
 *
 * Tables come only from here (CLAUDE.md). All three are organization-owned: they are shared
 * records, and a user-owned table would show each person only the rows they created. Nothing
 * is created until an administrator presses the button on Admin > Setup. Design:
 * `docs/invoice-design.md`.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { checkSuperAdmin, deniedResponse } from "@/lib/auth/require-signed-in";
import {
  INVOICE_FIELDS,
  INVOICE_LIMITS,
  INVOICE_LOGICAL_NAME,
  LINE_FIELDS,
  LINE_INVOICE_LOOKUP,
  LINE_INVOICE_RELATIONSHIP,
  LINE_LOGICAL_NAME,
  SEQUENCE_FIELDS,
  SEQUENCE_LOGICAL_NAME,
  STATUS_LABELS,
  STATUS_VALUES,
  TITLE_VALUES,
} from "@/lib/invoice/invoice-record";

const DATAVERSE_URL = process.env.NEXT_PUBLIC_DATAVERSE_URL;
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const METADATA_TIMEOUT_MS = 20_000;

const ODATA = "Microsoft.Dynamics.CRM";
const label = (text: string) => ({
  "@odata.type": `${ODATA}.Label`,
  LocalizedLabels: [{ "@odata.type": `${ODATA}.LocalizedLabel`, Label: text, LanguageCode: 1033 }],
});
const level = (required: boolean) => ({ Value: required ? "ApplicationRequired" : "None" });

const stringColumn = (schemaName: string, title: string, maxLength: number, required = false, isPrimaryName = false) => ({
  "@odata.type": `${ODATA}.StringAttributeMetadata`,
  SchemaName: schemaName,
  RequiredLevel: level(required),
  MaxLength: maxLength,
  DisplayName: label(title),
  ...(isPrimaryName ? { IsPrimaryName: true } : {}),
});

const memoColumn = (schemaName: string, title: string, maxLength: number) => ({
  "@odata.type": `${ODATA}.MemoAttributeMetadata`,
  SchemaName: schemaName,
  RequiredLevel: level(false),
  MaxLength: maxLength,
  Format: "TextArea",
  DisplayName: label(title),
});

const integerColumn = (schemaName: string, title: string, required = false) => ({
  "@odata.type": `${ODATA}.IntegerAttributeMetadata`,
  SchemaName: schemaName,
  RequiredLevel: level(required),
  Format: "None",
  MinValue: 0,
  MaxValue: 2147483647,
  DisplayName: label(title),
});

/** A plain number, not Money: Money needs Read on Currency (`.claude/rules/dataverse.md`). */
const decimalColumn = (schemaName: string, title: string, required = false) => ({
  "@odata.type": `${ODATA}.DecimalAttributeMetadata`,
  SchemaName: schemaName,
  RequiredLevel: level(required),
  Precision: 2,
  MinValue: -100000000000,
  MaxValue: 100000000000,
  DisplayName: label(title),
});

const dateOnlyColumn = (schemaName: string, title: string, required = false) => ({
  "@odata.type": `${ODATA}.DateTimeAttributeMetadata`,
  SchemaName: schemaName,
  RequiredLevel: level(required),
  Format: "DateOnly",
  DateTimeBehavior: { Value: "DateOnly" },
  DisplayName: label(title),
});

const choiceColumn = (schemaName: string, title: string, options: Array<[number, string]>, required = false) => ({
  "@odata.type": `${ODATA}.PicklistAttributeMetadata`,
  SchemaName: schemaName,
  RequiredLevel: level(required),
  DisplayName: label(title),
  OptionSet: {
    "@odata.type": `${ODATA}.OptionSetMetadata`,
    IsGlobal: false,
    OptionSetType: "Picklist",
    Options: options.map(([Value, text]) => ({ Value, Label: label(text) })),
  },
});

interface ColumnDef {
  SchemaName: string;
}
interface TableDef {
  logicalName: string;
  title: string;
  plural: string;
  description: string;
  primary: ColumnDef;
  columns: ColumnDef[];
}

const F = INVOICE_FIELDS;
const L = INVOICE_LIMITS;

const INVOICE_TABLE: TableDef = {
  logicalName: INVOICE_LOGICAL_NAME,
  title: "Invoice",
  plural: "Invoices",
  description: "Issued invoices and debit notes",
  primary: stringColumn(F.number, "Invoice number", L.number, true, true),
  columns: [
    integerColumn(F.fiscalYear, "Fiscal year", true),
    integerColumn(F.sequence, "Sequence", true),
    choiceColumn(F.title, "Title", Object.entries(TITLE_VALUES).map(([text, value]) => [value, text] as [number, string]), true),
    choiceColumn(
      F.status,
      "Status",
      (Object.keys(STATUS_VALUES) as Array<keyof typeof STATUS_VALUES>).map((key) => [STATUS_VALUES[key], STATUS_LABELS[key]]),
      true
    ),
    dateOnlyColumn(F.invoiceDate, "Invoice date", true),
    stringColumn(F.currency, "Currency", L.currency, true),
    decimalColumn(F.total, "Total", true),
    stringColumn(F.monthLabel, "Claim month", L.monthLabel),
    stringColumn(F.customerCode, "Customer code", L.customerCode, true),
    stringColumn(F.customerName, "Customer name", L.customerName, true),
    memoColumn(F.customerAddress, "Customer address", L.customerAddress),
    stringColumn(F.customerTradingPartnerId, "Customer trading partner ID", L.tradingPartnerId),
    stringColumn(F.paymentTerms, "Payment terms", L.paymentTerms),
    memoColumn(F.cancelReason, "Cancel reason", L.cancelReason),
    dateOnlyColumn(F.cancelledOn, "Cancelled on"),
  ],
};

const LINE_TABLE: TableDef = {
  logicalName: LINE_LOGICAL_NAME,
  title: "Invoice Line",
  plural: "Invoice Lines",
  description: "Lines of an invoice",
  primary: stringColumn(LINE_FIELDS.description, "Description", L.description, true, true),
  columns: [
    integerColumn(LINE_FIELDS.lineNo, "Line number", true),
    decimalColumn(LINE_FIELDS.amount, "Amount", true),
    stringColumn(LINE_FIELDS.sourceRow, "Source row (Claim to)", L.customerCode),
  ],
};

const SEQUENCE_TABLE: TableDef = {
  logicalName: SEQUENCE_LOGICAL_NAME,
  title: "Invoice Sequence",
  plural: "Invoice Sequences",
  description: "The last invoice number used, per fiscal year",
  primary: stringColumn(SEQUENCE_FIELDS.name, "Name", 20, true, true),
  columns: [integerColumn(SEQUENCE_FIELDS.fiscalYear, "Fiscal year", true), integerColumn(SEQUENCE_FIELDS.lastSequence, "Last sequence", true)],
};

const TABLES = [INVOICE_TABLE, LINE_TABLE, SEQUENCE_TABLE] as const;

function headers(token: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    // Writes land in this solution (unmanaged) instead of the Default Solution.
    ...(json && process.env.DATAVERSE_SOLUTION ? { "MSCRM.SolutionUniqueName": process.env.DATAVERSE_SOLUTION } : {}),
  };
}

/** The logical names of a table's columns, or `null` when the table is not there. */
async function readColumnNames(token: string, logicalName: string): Promise<Set<string> | null> {
  const url = `${API}/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName`;
  const response = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Metadata read failed for ${logicalName} (${response.status})`);
  const body = (await response.json()) as { value: { LogicalName: string }[] };
  return new Set(body.value.map((a) => a.LogicalName));
}

/** Whether the key on the invoice number exists. `null` when it could not be asked. */
async function readNumberKeyExists(token: string): Promise<boolean | null> {
  const url = `${API}/EntityDefinitions(LogicalName='${INVOICE_LOGICAL_NAME}')/Keys?$select=SchemaName,KeyAttributes`;
  const response = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
  if (!response.ok) return null;
  const body = (await response.json()) as { value: { KeyAttributes?: string[] }[] };
  return body.value.some((key) => key.KeyAttributes?.includes(F.number));
}

interface Status {
  tables: Record<string, Set<string> | null>;
  missing: string[];
}

async function readStatus(token: string): Promise<Status> {
  const tables: Record<string, Set<string> | null> = {};
  const missing: string[] = [];
  for (const table of TABLES) {
    const names = await readColumnNames(token, table.logicalName);
    tables[table.logicalName] = names;
    if (names === null) {
      missing.push(`${table.logicalName} (table)`);
      continue;
    }
    for (const column of [table.primary, ...table.columns]) {
      if (!names.has(column.SchemaName)) missing.push(`${table.logicalName}.${column.SchemaName}`);
    }
  }
  const lineNames = tables[LINE_LOGICAL_NAME];
  if (lineNames && !lineNames.has(LINE_INVOICE_LOOKUP)) missing.push(`${LINE_LOGICAL_NAME}.${LINE_INVOICE_LOOKUP} (lookup to invoice)`);
  if (tables[INVOICE_LOGICAL_NAME]) {
    const keyExists = await readNumberKeyExists(token);
    if (keyExists === false) missing.push(`${INVOICE_LOGICAL_NAME} unique key on ${F.number}`);
  }
  return { tables, missing };
}

export async function GET() {
  try {
    const admin = await checkSuperAdmin();
    if (!admin.user) return deniedResponse(admin.reason);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const { tables, missing } = await readStatus(token);
    // A table that is not there has nothing to top up: the button says Create.
    const missingColumns = Object.values(tables).every((names) => names === null) ? [] : missing;
    return NextResponse.json({
      exists: Object.values(tables).every((names) => names !== null),
      tableName: TABLES.map((t) => t.logicalName).join(", "),
      missingColumns,
      pending: missingColumns,
    });
  } catch (error) {
    console.error("[Setup API] Error checking the invoice tables:", error);
    return NextResponse.json({ error: "Failed to check the invoice tables" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const admin = await checkSuperAdmin();
    if (!admin.user) return deniedResponse(admin.reason);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const created: string[] = [];
    const added: string[] = [];
    const failed: string[] = [];

    for (const table of TABLES) {
      let names = await readColumnNames(token, table.logicalName);
      if (names === null) {
        const response = await fetch(`${API}/EntityDefinitions`, {
          method: "POST",
          headers: headers(token, true),
          body: JSON.stringify({
            "@odata.type": `${ODATA}.EntityMetadata`,
            SchemaName: table.logicalName,
            DisplayName: label(table.title),
            DisplayCollectionName: label(table.plural),
            Description: label(table.description),
            OwnershipType: "OrganizationOwned",
            IsActivity: false,
            HasActivities: false,
            HasNotes: false,
            PrimaryNameAttribute: table.primary.SchemaName,
            Attributes: [table.primary],
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          console.error(`[Setup API] Failed to create ${table.logicalName}:`, detail);
          failed.push(`${table.logicalName} (table): ${detail.substring(0, 300)}`);
          continue;
        }
        created.push(table.logicalName);
        names = await readColumnNames(token, table.logicalName);
      }

      // Only what is missing: adding a column that exists is an error, not a no-op.
      for (const column of table.columns) {
        if (names?.has(column.SchemaName)) continue;
        const response = await fetch(`${API}/EntityDefinitions(LogicalName='${table.logicalName}')/Attributes`, {
          method: "POST",
          headers: headers(token, true),
          body: JSON.stringify(column),
        });
        if (response.ok) added.push(`${table.logicalName}.${column.SchemaName}`);
        else {
          const detail = (await response.text()).substring(0, 300);
          console.error(`[Setup API] Failed to add ${column.SchemaName}:`, detail);
          failed.push(`${table.logicalName}.${column.SchemaName}`);
        }
      }
    }

    // The lookup from a line to its invoice: a one-to-many relationship, which creates the column.
    const lineNames = await readColumnNames(token, LINE_LOGICAL_NAME);
    const invoiceNames = await readColumnNames(token, INVOICE_LOGICAL_NAME);
    if (lineNames && invoiceNames && !lineNames.has(LINE_INVOICE_LOOKUP)) {
      const response = await fetch(`${API}/RelationshipDefinitions`, {
        method: "POST",
        headers: headers(token, true),
        body: JSON.stringify({
          "@odata.type": `${ODATA}.OneToManyRelationshipMetadata`,
          SchemaName: LINE_INVOICE_RELATIONSHIP,
          ReferencedEntity: INVOICE_LOGICAL_NAME,
          ReferencingEntity: LINE_LOGICAL_NAME,
          CascadeConfiguration: {
            Assign: "NoCascade",
            Delete: "Restrict",
            Merge: "NoCascade",
            Reparent: "NoCascade",
            Share: "NoCascade",
            Unshare: "NoCascade",
          },
          Lookup: {
            "@odata.type": `${ODATA}.LookupAttributeMetadata`,
            AttributeType: "Lookup",
            AttributeTypeName: { Value: "LookupType" },
            SchemaName: LINE_INVOICE_LOOKUP,
            RequiredLevel: level(false),
            DisplayName: label("Invoice"),
          },
        }),
      });
      if (response.ok) added.push(`${LINE_LOGICAL_NAME}.${LINE_INVOICE_LOOKUP} (lookup)`);
      else {
        console.error("[Setup API] Failed to create the line -> invoice lookup:", (await response.text()).substring(0, 400));
        failed.push(`${LINE_LOGICAL_NAME}.${LINE_INVOICE_LOOKUP} (lookup)`);
      }
    }

    // The unique key on the invoice number: the last line of defence against a duplicate number.
    if (invoiceNames?.has(F.number) && (await readNumberKeyExists(token)) === false) {
      const response = await fetch(`${API}/EntityDefinitions(LogicalName='${INVOICE_LOGICAL_NAME}')/Keys`, {
        method: "POST",
        headers: headers(token, true),
        body: JSON.stringify({
          SchemaName: "hi_invoice_number_key",
          DisplayName: label("Invoice number"),
          KeyAttributes: [F.number],
        }),
      });
      if (response.ok) added.push(`${INVOICE_LOGICAL_NAME} unique key on ${F.number}`);
      else {
        console.error("[Setup API] Failed to create the invoice number key:", (await response.text()).substring(0, 400));
        failed.push(`${INVOICE_LOGICAL_NAME} unique key on ${F.number}`);
      }
    }

    const message =
      (created.length ? `Created ${created.join(", ")}` : "No table to create") +
      (added.length ? ` - added ${added.join(", ")}` : "") +
      (failed.length ? ` - could not add ${failed.join("; ")}` : "") +
      ".";
    return NextResponse.json({ success: failed.length === 0, message, created, added, failed });
  } catch (error) {
    console.error("[Setup API] Error creating the invoice tables:", error);
    return NextResponse.json({ error: "Failed to create the invoice tables" }, { status: 500 });
  }
}
