/**
 * Admin Setup API - the invoice customer table (`hi_invoicecustomer`)
 *
 * GET:  does the table exist, and which columns are missing
 * POST: create it, or add the columns it lacks
 *
 * Tables come only from here (CLAUDE.md). Organization-owned on purpose: the customer master
 * is shared, and a user-owned table would show each person only the rows they created.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { checkSuperAdmin, deniedResponse } from "@/lib/auth/require-signed-in";
import { CUSTOMER_FIELDS, CUSTOMER_LIMITS, CUSTOMER_LOGICAL_NAME } from "@/lib/invoice/customer-record";

const DATAVERSE_URL = process.env.NEXT_PUBLIC_DATAVERSE_URL;
const METADATA_TIMEOUT_MS = 20_000;

const label = (text: string) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.Label",
  LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: text, LanguageCode: 1033 }],
});

const stringColumn = (schemaName: string, title: string, maxLength: number, required: boolean, isPrimaryName = false) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
  SchemaName: schemaName,
  RequiredLevel: { Value: required ? "ApplicationRequired" : "None" },
  MaxLength: maxLength,
  DisplayName: label(title),
  ...(isPrimaryName ? { IsPrimaryName: true } : {}),
});

const F = CUSTOMER_FIELDS;
const L = CUSTOMER_LIMITS;

/** The primary name column, created with the table. */
const PRIMARY_COLUMN = stringColumn(F.code, "Code", L.code, true, true);

/** Every other column, in the order they are added. */
const SECONDARY_COLUMNS = [
  stringColumn(F.name, "Name", L.name, true),
  stringColumn(F.address1, "Address line 1", L.addressLine, false),
  stringColumn(F.address2, "Address line 2", L.addressLine, false),
  stringColumn(F.address3, "Address line 3", L.addressLine, false),
  stringColumn(F.tradingPartnerId, "Trading Partner ID", L.tradingPartnerId, false),
  stringColumn(F.paymentTerms, "Payment terms", L.paymentTerms, false),
  stringColumn(F.defaultTitles, "Default titles", L.defaultTitles, false),
  stringColumn(F.notifyTo, "Notify To", L.notifyList, false),
  stringColumn(F.notifyCc, "Notify Cc", L.notifyList, false),
];

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

/** The logical names of the table's columns, or `null` when the table is not there. */
async function readColumnNames(token: string): Promise<Set<string> | null> {
  const url = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${CUSTOMER_LOGICAL_NAME}')/Attributes?$select=LogicalName`;
  const response = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Metadata read failed (${response.status})`);
  const body = (await response.json()) as { value: { LogicalName: string }[] };
  return new Set(body.value.map((a) => a.LogicalName));
}

const missingFrom = (names: Set<string> | null): string[] =>
  [PRIMARY_COLUMN, ...SECONDARY_COLUMNS].map((c) => c.SchemaName).filter((n) => !names || !names.has(n));

export async function GET() {
  try {
    const admin = await checkSuperAdmin();
    if (!admin.user) return deniedResponse(admin.reason);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const names = await readColumnNames(token);
    return NextResponse.json({
      exists: names !== null,
      tableName: CUSTOMER_LOGICAL_NAME,
      missingColumns: names === null ? [] : missingFrom(names),
    });
  } catch (error) {
    console.error("[Setup API] Error checking the customer table:", error);
    return NextResponse.json({ error: "Failed to check the customer table" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const admin = await checkSuperAdmin();
    if (!admin.user) return deniedResponse(admin.reason);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    let names = await readColumnNames(token);
    let created = false;

    if (names === null) {
      const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions`, {
        method: "POST",
        headers: headers(token, true),
        body: JSON.stringify({
          "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
          SchemaName: CUSTOMER_LOGICAL_NAME,
          DisplayName: label("Invoice Customer"),
          DisplayCollectionName: label("Invoice Customers"),
          Description: label("Companies invoices are addressed to"),
          OwnershipType: "OrganizationOwned",
          IsActivity: false,
          HasActivities: false,
          HasNotes: false,
          PrimaryNameAttribute: F.code,
          Attributes: [PRIMARY_COLUMN],
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("[Setup API] Failed to create the customer table:", detail);
        return NextResponse.json(
          { error: "Failed to create the table", details: detail.substring(0, 500) },
          { status: response.status }
        );
      }
      created = true;
      names = await readColumnNames(token);
    }

    // Only what is missing: adding a column that exists is an error, not a no-op.
    const baseUrl = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${CUSTOMER_LOGICAL_NAME}')/Attributes`;
    const added: string[] = [];
    const failed: string[] = [];
    for (const column of SECONDARY_COLUMNS) {
      if (names?.has(column.SchemaName)) continue;
      const response = await fetch(baseUrl, { method: "POST", headers: headers(token, true), body: JSON.stringify(column) });
      if (response.ok) added.push(column.SchemaName);
      else {
        failed.push(column.SchemaName);
        console.error(`[Setup API] Failed to add ${column.SchemaName}:`, (await response.text()).substring(0, 300));
      }
    }

    const message =
      (created ? "Table created" : "Table already exists") +
      (added.length ? ` - added ${added.join(", ")}` : created ? "" : " - nothing to add") +
      (failed.length ? ` - could not add ${failed.join(", ")}` : "") +
      ".";
    return NextResponse.json({ success: failed.length === 0, message, created, added, failed });
  } catch (error) {
    console.error("[Setup API] Error creating the customer table:", error);
    return NextResponse.json({ error: "Failed to create the table" }, { status: 500 });
  }
}
