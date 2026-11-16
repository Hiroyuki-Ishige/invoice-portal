/**
 * **Adding one column to an existing Dataverse table, from Admin > Setup.**
 *
 * The three older setup routes (approval-table, create-approval-table,
 * iir-approval-columns) each carry their own copy of this; it was written once
 * here for the item name history (2026-10-20) so the next card does not make a
 * fourth. Moving the three onto it is standing debt, left for when each is
 * touched for another reason.
 *
 * Server only: it posts metadata with the caller's token - which is why it
 * sits with the Dataverse provider, not in `utils/`.
 */

import { dataverseMessage } from "./client";

const DATAVERSE_URL = process.env.NEXT_PUBLIC_DATAVERSE_URL;
const SOLUTION_NAME = "CAPEXBudgetControlPAYG";
/** How long a metadata read may take before it is reported as unanswered. */
const METADATA_TIMEOUT_MS = 20_000;

export interface ColumnResult {
  name: string;
  status: "created" | "exists" | "failed";
  error?: string;
}

/** Dataverse's own sentence (`client.dataverseMessage`), cut to what a card can show. */
const refusalOf = (raw: string): string => dataverseMessage(raw).slice(0, 400);

/** POSTs one attribute definition; an existing column answers "exists". */
export async function addColumn(
  token: string,
  entityLogicalName: string,
  column: { SchemaName: string } & Record<string, unknown>
): Promise<ColumnResult> {
  const url = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "MSCRM.SolutionUniqueName": SOLUTION_NAME,
      },
      body: JSON.stringify(column),
    });
    if (!response.ok) {
      const error = await response.text();
      if (error.includes("already exists") || error.includes("DuplicateName")) {
        return { name: column.SchemaName, status: "exists" };
      }
      return { name: column.SchemaName, status: "failed", error: refusalOf(error) };
    }
    return { name: column.SchemaName, status: "created" };
  } catch (error) {
    return { name: column.SchemaName, status: "failed", error: String(error) };
  }
}

/**
 * The table's column names, or `null` when the metadata could not be read -
 * "could not ask" is not "absent" (rule 6). `tableMissing` is the one refusal
 * that means something specific.
 */
export async function columnNamesOf(
  token: string,
  entityLogicalName: string
): Promise<{ names: Set<string> | null; tableMissing: boolean }> {
  try {
    const response = await fetch(
      `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      }
    );
    if (!response.ok) return { names: null, tableMissing: response.status === 404 };
    const { value = [] } = (await response.json()) as { value?: Array<{ LogicalName: string }> };
    return { names: new Set(value.map((a) => a.LogicalName)), tableMissing: false };
  } catch {
    return { names: null, tableMissing: false };
  }
}
