/**
 * Admin Setup API - Create the Invoice Portal user table
 *
 * POST: Create the Invoice Portal user table (`hi_invoiceuserprofile`) in Dataverse
 * GET: Check if table exists
 *
 * This endpoint allows admins to create the user profile table
 * using their authenticated token.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { checkSuperAdmin } from "@/lib/auth/require-signed-in";
import { ROLE_LABELS, ROLE_VALUES, USER_PROFILE_LOGICAL_NAME, USER_ROLES, type UserRole } from "@/lib/types/user-profile";

/** Writes land in this solution (unmanaged) instead of the Default Solution. */
const SOLUTION_HEADER: Record<string, string> = process.env.DATAVERSE_SOLUTION
  ? { "MSCRM.SolutionUniqueName": process.env.DATAVERSE_SOLUTION }
  : {};
import { describeColumns, type SchemaColumn } from "@/lib/utils/schema-report";

const DATAVERSE_URL = process.env.NEXT_PUBLIC_DATAVERSE_URL;
const PUBLISHER_PREFIX = "hi";

/** How long a metadata read may take before it is reported as unanswered. */
const METADATA_TIMEOUT_MS = 20_000;

/**
 * Check if current user is super admin
 */
/**
 * Check if table exists
 */
async function checkTableExists(
  token: string,
  logicalName: string
): Promise<boolean> {
  const url = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });

  return response.ok;
}

/**
 * GET - Check if table exists
 */
export async function GET() {
  try {
    // Identity comes from Dataverse, not from the dv_user_email cookie: that
    // cookie's value is whatever the browser posted at sign-in, so any signed-in
    // user could previously have claimed a super admin's address here.
    const admin = await checkSuperAdmin();
    if (!admin.user) {
      // 401 when the session lapsed, 403 when the account is simply not allowed -
      // the caller needs to know which, because the fixes differ.
      return admin.reason === "not_signed_in"
        ? NextResponse.json(
            { error: "Session expired - sign in again", code: "SESSION_EXPIRED" },
            { status: 401 }
          )
        : NextResponse.json(
            { error: "Forbidden - super admin access required" },
            { status: 403 }
          );
    }
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const exists = await checkTableExists(
      token,
      USER_PROFILE_LOGICAL_NAME
    );

    return NextResponse.json({
      exists,
      tableName: USER_PROFILE_LOGICAL_NAME,
      // A table that is not there yet has no gaps to report - but the list is
      // still worth sending, so the card can show what creating it would build
      // rather than going blank at the one moment it is being decided.
      schema: exists
        ? await readSchemaGaps(token)
        : {
            checked: false,
            missingColumns: [],
            missingRoleOption: false,
            missingRoleOptions: [],
            staleRoleLabels: [],
            columns: describeColumns(EXPECTED_COLUMNS, null),
          },
    });
  } catch (error) {
    console.error("[Setup API] Error checking table:", error);
    return NextResponse.json(
      { error: "Failed to check table existence" },
      { status: 500 }
    );
  }
}

/**
 * POST - Create the user table
 */
export async function POST() {
  try {
    // Identity comes from Dataverse, not from the dv_user_email cookie: that
    // cookie's value is whatever the browser posted at sign-in, so any signed-in
    // user could previously have claimed a super admin's address here.
    const admin = await checkSuperAdmin();
    if (!admin.user) {
      // 401 when the session lapsed, 403 when the account is simply not allowed -
      // the caller needs to know which, because the fixes differ.
      return admin.reason === "not_signed_in"
        ? NextResponse.json(
            { error: "Session expired - sign in again", code: "SESSION_EXPIRED" },
            { status: 401 }
          )
        : NextResponse.json(
            { error: "Forbidden - super admin access required" },
            { status: 403 }
          );
    }
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Check if table already exists
    const exists = await checkTableExists(
      token,
      USER_PROFILE_LOGICAL_NAME
    );
    if (exists) {
      // The table predates the later roles (F&A-Admin, IIR-Admin) and the
      // entity access column, so top them up rather than making an operator
      // add them by hand in Dataverse - and a role renamed since the table was
      // made gets its option's label renamed with it. All idempotent: a second
      // run simply does nothing.
      const rolesAdded = await ensureLaterRoleOptions(token);
      const columnsAdded = await ensureLaterColumns(token);
      const labels = await ensureRoleOptionLabels(token);

      const done = [
        ...(rolesAdded.length > 0 || columnsAdded.length > 0
          ? [
              `added ${[
                ...rolesAdded.map((role) => `the ${ROLE_LABELS[role]} role option`),
                ...columnsAdded,
              ].join(", ")}`,
            ]
          : []),
        ...labels.renamed.map(({ from, to }) => `renamed the ${from} role option to ${to}`),
        ...labels.failed.map(({ from, to }) => `could not rename the ${from} role option to ${to}`),
      ];
      /* A rename Dataverse took but did not publish is saved, and the app reads
         the value, not the label - but the Power Apps screens show the old name
         until somebody publishes. Say so rather than report it done (rule 10). */
      const unpublished =
        labels.renamed.length > 0 && !labels.published
          ? " The new label is saved but not yet published - publish the Invoice Portal user table in Power Apps to show it there."
          : "";

      return NextResponse.json({
        success: labels.failed.length === 0,
        message:
          (done.length > 0
            ? `Table already exists - ${done.join("; ")}.`
            : "Table already exists - nothing to add") + unpublished,
        created: false,
        roleOptionAdded: rolesAdded.length > 0,
        rolesAdded: rolesAdded.map((role) => ROLE_LABELS[role]),
        roleLabelsRenamed: labels.renamed,
        columnsAdded,
      });
    }

    // Create entity definition
    const entityDefinition = {
      "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
      SchemaName: USER_PROFILE_LOGICAL_NAME,
      DisplayName: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: "Invoice Portal User",
            LanguageCode: 1033,
          },
        ],
      },
      DisplayCollectionName: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: "Invoice Portal Users",
            LanguageCode: 1033,
          },
        ],
      },
      Description: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: "Invoice Portal users for authorization (separate from CAPEX Budget Control)",
            LanguageCode: 1033,
          },
        ],
      },
      OwnershipType: "UserOwned",
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      PrimaryNameAttribute: `${PUBLISHER_PREFIX}_email`,
      Attributes: [
        // Primary Name Attribute (Email)
        {
          "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
          SchemaName: `${PUBLISHER_PREFIX}_email`,
          RequiredLevel: {
            Value: "ApplicationRequired",
          },
          MaxLength: 320,
          FormatName: {
            Value: "Email",
          },
          DisplayName: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [
              {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                Label: "Email",
                LanguageCode: 1033,
              },
            ],
          },
          Description: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [
              {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                Label: "User email address (primary)",
                LanguageCode: 1033,
              },
            ],
          },
          IsPrimaryName: true,
        },
      ],
    };

    console.log("[Setup API] Creating the user table...");

    const createResponse = await fetch(
      `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          ...SOLUTION_HEADER,
        },
        body: JSON.stringify(entityDefinition),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("[Setup API] Failed to create table:", errorText);
      return NextResponse.json(
        {
          error: "Failed to create table",
          details: errorText.substring(0, 500),
        },
        { status: createResponse.status }
      );
    }

    console.log("[Setup API] Table created, adding columns...");

    // Add additional columns
    const columnsResult = await addColumns(token);

    return NextResponse.json({
      success: true,
      message: "Table created successfully",
      created: true,
      columns: columnsResult,
    });
  } catch (error) {
    console.error("[Setup API] Error creating table:", error);
    return NextResponse.json(
      {
        error: "Failed to create table",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Add additional columns to the table
 */
/**
 * Every column beyond the primary name, in the order the create path adds them.
 *
 * At module scope so the schema report reads the same definitions the writer
 * sends - a second list would drift, and the page would then describe a table
 * nobody builds.
 */
const SECONDARY_COLUMNS = [
  // Display Name
  {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    SchemaName: `${PUBLISHER_PREFIX}_displayname`,
    RequiredLevel: { Value: "None" },
    MaxLength: 200,
    DisplayName: {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          Label: "Display Name",
          LanguageCode: 1033,
        },
      ],
    },
  },
  // Azure User ID
  {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    SchemaName: `${PUBLISHER_PREFIX}_azureuserid`,
    RequiredLevel: { Value: "None" },
    MaxLength: 100,
    DisplayName: {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          Label: "Azure User ID",
          LanguageCode: 1033,
        },
      ],
    },
  },
  // Is Active (Boolean)
  {
    "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
    SchemaName: `${PUBLISHER_PREFIX}_isactive`,
    RequiredLevel: { Value: "None" },
    DefaultValue: true,
    DisplayName: {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          Label: "Is Active",
          LanguageCode: 1033,
        },
      ],
    },
    OptionSet: {
      "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
      TrueOption: {
        Value: 1,
        Label: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: "Yes",
              LanguageCode: 1033,
            },
          ],
        },
      },
      FalseOption: {
        Value: 0,
        Label: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: "No",
              LanguageCode: 1033,
            },
          ],
        },
      },
    },
  },
  // Job Title - as the directory read it when the user was registered
  {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    SchemaName: `${PUBLISHER_PREFIX}_jobtitle`,
    RequiredLevel: { Value: "None" },
    MaxLength: 200,
    DisplayName: {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          Label: "Job Title",
          LanguageCode: 1033,
        },
      ],
    },
  },
  // Entity Access (JSON) - what this user may do per CAPEX entity
  {
    "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
    SchemaName: `${PUBLISHER_PREFIX}_entityaccess`,
    RequiredLevel: { Value: "None" },
    MaxLength: 8192,
    DisplayName: {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          Label: "Entity Access (JSON)",
          LanguageCode: 1033,
        },
      ],
    },
  },
  // Last Login At (DateTime)
  {
    "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
    SchemaName: `${PUBLISHER_PREFIX}_lastloginat`,
    RequiredLevel: { Value: "None" },
    Format: "DateAndTime",
    DisplayName: {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          Label: "Last Login At",
          LanguageCode: 1033,
        },
      ],
    },
  },
];

/** The role choice, kept apart because it carries its own option set. */
const ROLE_COLUMN = {
  "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
  SchemaName: `${PUBLISHER_PREFIX}_role`,
  RequiredLevel: { Value: "None" },
  DisplayName: {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [
      {
        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
        Label: "Role",
        LanguageCode: 1033,
      },
    ],
  },
  OptionSet: {
    "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
    IsGlobal: false,
    OptionSetType: "Picklist",
    /* Every role, from the one list - a new role is an option here without
       a second spelling of it (rule 20). */
    Options: USER_ROLES.map((role) => ({
      Value: ROLE_VALUES[role],
      Label: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: ROLE_LABELS[role],
            LanguageCode: 1033,
          },
        ],
      },
    })),
  },
};

async function addColumns(
  token: string
): Promise<{ success: string[]; failed: string[] }> {
  const entityLogicalName = USER_PROFILE_LOGICAL_NAME;
  const baseUrl = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`;

  const results = {
    success: [] as string[],
    failed: [] as string[],
  };


  const columns = SECONDARY_COLUMNS;

  for (const column of columns) {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
          ...SOLUTION_HEADER,
      },
      body: JSON.stringify(column),
    });

    const schemaName = column.SchemaName;
    if (response.ok) {
      results.success.push(schemaName);
      console.log(`[Setup API] Added column: ${schemaName}`);
    } else {
      results.failed.push(schemaName);
      console.warn(`[Setup API] Failed to add column: ${schemaName}`);
    }
  }

  // Add Role choice column (PicklistAttributeMetadata)
  const roleColumn = ROLE_COLUMN;

  const roleResponse = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
          ...SOLUTION_HEADER,
    },
    body: JSON.stringify(roleColumn),
  });

  if (roleResponse.ok) {
    results.success.push(`${PUBLISHER_PREFIX}_role`);
    console.log(`[Setup API] Added column: ${PUBLISHER_PREFIX}_role`);
  } else {
    results.failed.push(`${PUBLISHER_PREFIX}_role`);
    console.warn(`[Setup API] Failed to add column: ${PUBLISHER_PREFIX}_role`);
  }

  return results;
}

/**
 * Columns that arrived after the table did, with the label to report them by.
 *
 * Adding one here is all that is needed for an existing environment to get it:
 * the create path already sends the full list, and this is the top-up path.
 */
const LATER_COLUMNS = [
  {
    label: "the Job Title column",
    definition: {
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      SchemaName: `${PUBLISHER_PREFIX}_jobtitle`,
      RequiredLevel: { Value: "None" },
      MaxLength: 200,
      DisplayName: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: "Job Title",
            LanguageCode: 1033,
          },
        ],
      },
    },
  },
  {
    label: "the Entity Access column",
    definition: {
      "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
      SchemaName: `${PUBLISHER_PREFIX}_entityaccess`,
      RequiredLevel: { Value: "None" },
      MaxLength: 8192,
      DisplayName: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: "Entity Access (JSON)",
            LanguageCode: 1033,
          },
        ],
      },
    },
  },
];

/**
 * What the top-up path would actually add, so the button can be offered only
 * when it has something to do.
 *
 * Deliberately limited to what POST repairs on an existing table - the later
 * columns and the later role options. Reporting any other column as missing
 * would name a gap this button does not close.
 *
 * `checked: false` means the metadata could not be read, which is **not** the
 * same as "nothing is missing": reading EntityDefinitions needs privileges
 * beyond reading records, and the same quirk already makes the table-exists
 * indicator unreliable. The caller keeps offering the repair in that case - it
 * is idempotent, and hiding it would leave no way out.
 */
interface SchemaGaps {
  checked: boolean;
  missingColumns: string[];
  missingRoleOption: boolean;
  /** The role options missing, by label ("IIR-Admin"). */
  missingRoleOptions: string[];
  /** Options there under an older label - POST renames them. */
  staleRoleLabels: Array<{ from: string; to: string }>;
  columns: SchemaColumn[];
}

/**
 * Every column the app expects, in the order the create path writes them.
 *
 * The primary name column comes first because it is created with the table
 * rather than by the loop, and is the one column that cannot be absent while
 * the table exists.
 */
const PRIMARY_EMAIL_COLUMN = {
  "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
  SchemaName: `${PUBLISHER_PREFIX}_email`,
  DisplayName: { LocalizedLabels: [{ Label: "Email (Primary)" }] },
} as const;

const EXPECTED_COLUMNS = [PRIMARY_EMAIL_COLUMN, ...SECONDARY_COLUMNS, ROLE_COLUMN];

async function readSchemaGaps(token: string): Promise<SchemaGaps> {
  const entity = USER_PROFILE_LOGICAL_NAME;
  const headers = {
    Authorization: `Bearer ${token}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
  };

  try {
    // Bounded: `fetch` has no timeout, so a Dataverse call that never answers
    // would hold this request open and spin the caller's card indefinitely.
    const response = await fetch(
      `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName`,
      { headers, signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) }
    );
    if (!response.ok) {
      return {
        checked: false,
        missingColumns: [],
        missingRoleOption: false,
        missingRoleOptions: [],
        staleRoleLabels: [],
        columns: describeColumns(EXPECTED_COLUMNS, null),
      };
    }

    const { value = [] } = (await response.json()) as {
      value?: Array<{ LogicalName: string }>;
    };
    const present = new Set(value.map((a) => a.LogicalName.toLowerCase()));
    const missingColumns = LATER_COLUMNS.map((c) =>
      c.definition.SchemaName.toLowerCase()
    ).filter((name) => !present.has(name));

    // One read of the option set answers both questions about it.
    const options = present.has(`${PUBLISHER_PREFIX}_role`) ? await readRoleOptions(token) : null;
    const missingRoles = missingRoleOptions(options);

    return {
      checked: true,
      missingColumns,
      missingRoleOption: missingRoles.length > 0,
      missingRoleOptions: missingRoles.map((role) => ROLE_LABELS[role]),
      staleRoleLabels: staleRoleLabels(options).map(({ from, to }) => ({ from, to })),
      columns: describeColumns(EXPECTED_COLUMNS, present),
    };
  } catch (error) {
    console.error("[Setup API] Could not read the user profile schema:", error);
    return {
      checked: false,
      missingColumns: [],
      missingRoleOption: false,
      missingRoleOptions: [],
      staleRoleLabels: [],
      columns: describeColumns(EXPECTED_COLUMNS, null),
    };
  }
}

/**
 * Roles added after the table was first made - the options Setup tops up on
 * an existing table: F&A-Admin, then CAPEX-Admin (2026-09-28; IIR-Admin since
 * 2026-10-17, which `ensureRoleOptionLabels` carries to an existing table).
 */
const LATER_ROLES: readonly UserRole[] = ["faadmin", "invoicepreparer", "invoicereceiver"];

/** One option of hi_role as Dataverse holds it: its value and English label. */
interface RoleOption {
  value: number;
  /** The 1033 label - the language this route writes. `null` when it has none. */
  label: string | null;
}

/**
 * hi_role's options, or `null` when they could not be read.
 *
 * `null` is "could not ask", never "no options" (rule 6): both callers answer
 * it with *nothing to do*, so an unreadable option set never turns into "add
 * this" or "rename that" on a table that may be perfectly fine.
 */
async function readRoleOptions(token: string): Promise<RoleOption[] | null> {
  const url =
    `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${USER_PROFILE_LOGICAL_NAME}')` +
    `/Attributes(LogicalName='${PUBLISHER_PREFIX}_role')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
    `?$select=LogicalName&$expand=OptionSet`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  // Metadata off the wire is `unknown` until looked at (rule 12).
  const data = (await response.json()) as { OptionSet?: { Options?: unknown } };
  const options = data.OptionSet?.Options;
  if (!Array.isArray(options)) return null;

  return options.flatMap((option): RoleOption[] => {
    const value = (option as { Value?: unknown })?.Value;
    if (typeof value !== "number") return [];
    const label = (option as { Label?: { LocalizedLabels?: unknown } }).Label;
    const english = Array.isArray(label?.LocalizedLabels)
      ? (label.LocalizedLabels as Array<{ Label?: unknown; LanguageCode?: unknown }>).find(
          (localized) => localized?.LanguageCode === 1033
        )?.Label
      : undefined;
    return [{ value, label: typeof english === "string" ? english : null }];
  });
}

/**
 * Which of the roles added after the table was first made (`LATER_ROLES`)
 * hi_role has no option for. Absent hi_role answers none - a table that old
 * needs more than this button.
 */
function missingRoleOptions(options: RoleOption[] | null): UserRole[] {
  if (!options) return [];
  return LATER_ROLES.filter((role) => !options.some((option) => option.value === ROLE_VALUES[role]));
}

/** A role option whose label in Dataverse is not the one the app prints. */
interface StaleRoleLabel {
  role: UserRole;
  /** What Dataverse calls it now ("CAPEX-Admin"). */
  from: string;
  /** What `ROLE_LABELS` calls it ("IIR-Admin"). */
  to: string;
}

/**
 * The options whose label has fallen behind `ROLE_LABELS` - CAPEX-Admin,
 * renamed IIR-Admin on 2026-10-17, on any table made before that day.
 *
 * Only an option that is there **with** a label it differs from: an absent
 * option is `missingRoleOptions`' business, and an option with no English
 * label is not one this route can say it is renaming.
 */
function staleRoleLabels(options: RoleOption[] | null): StaleRoleLabel[] {
  if (!options) return [];
  return USER_ROLES.flatMap((role) => {
    const option = options.find((candidate) => candidate.value === ROLE_VALUES[role]);
    if (!option || option.label === null || option.label === ROLE_LABELS[role]) return [];
    return [{ role, from: option.label, to: ROLE_LABELS[role] }];
  });
}

/**
 * Adds the later columns to an existing table, and reports which it added.
 *
 * Without them the user screen still works - the writes drop the property and
 * say so - but a title and the rights granted are not kept, so this is the one
 * action that makes them stick. Dataverse refuses a column that already exists,
 * which is the normal outcome on a second run, so a failure is reported per
 * column rather than thrown.
 */
async function ensureLaterColumns(token: string): Promise<string[]> {
  const url = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${USER_PROFILE_LOGICAL_NAME}')/Attributes`;
  const added: string[] = [];

  for (const column of LATER_COLUMNS) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
          ...SOLUTION_HEADER,
      },
      body: JSON.stringify(column.definition),
    });

    if (response.ok) {
      console.log(`[Setup API] Added ${column.definition.SchemaName}`);
      added.push(column.label);
      continue;
    }

    const reason = await response.text();
    console.log(
      `[Setup API] ${column.definition.SchemaName} not added (likely already present): ${reason.slice(0, 200)}`
    );
  }

  return added;
}

/**
 * Adds a role's option to hi_role if it is missing.
 *
 * `InsertOptionValue` is rejected when the value is already there, which is the
 * normal outcome on a second run - so a failure here is reported, never thrown.
 */
async function ensureRoleOption(
  token: string,
  role: UserRole
): Promise<{ added: boolean; reason?: string }> {
  const url = `${DATAVERSE_URL}/api/data/v9.2/InsertOptionValue`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
          ...SOLUTION_HEADER,
    },
    body: JSON.stringify({
      EntityLogicalName: USER_PROFILE_LOGICAL_NAME,
      AttributeLogicalName: `${PUBLISHER_PREFIX}_role`,
      Value: ROLE_VALUES[role],
      Label: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: ROLE_LABELS[role],
            LanguageCode: 1033,
          },
        ],
      },
    }),
  });

  if (response.ok) {
    console.log(`[Setup API] Added the ${ROLE_LABELS[role]} option to hi_role`);
    return { added: true };
  }

  const reason = await response.text();
  console.log(`[Setup API] ${ROLE_LABELS[role]} option not added (likely already present): ${reason.slice(0, 200)}`);
  return { added: false, reason };
}

/** Every later role's option, one at a time; the roles it added. */
async function ensureLaterRoleOptions(token: string): Promise<UserRole[]> {
  const added: UserRole[] = [];
  for (const role of LATER_ROLES) {
    if ((await ensureRoleOption(token, role)).added) added.push(role);
  }
  return added;
}

/** JSON headers for a Dataverse action. */
function actionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
          ...SOLUTION_HEADER,
  };
}

/**
 * Renames every hi_role option whose label has fallen behind `ROLE_LABELS`,
 * then publishes the table so the new name reaches Dataverse's own screens.
 *
 * `UpdateOptionValue` with `MergeLabels: true` replaces the English (1033)
 * label and keeps any other language somebody added by hand. The value never
 * changes - it is what every profile and the saved role permissions hold.
 *
 * Reads the options first rather than renaming blind, so a second run sends
 * nothing and the result names only what it changed. An unreadable option set
 * renames nothing (rule 6): the Setup card keeps offering the button in that
 * case, and the next run asks again.
 */
async function ensureRoleOptionLabels(token: string): Promise<{
  renamed: StaleRoleLabel[];
  failed: StaleRoleLabel[];
  published: boolean;
}> {
  const stale = staleRoleLabels(await readRoleOptions(token).catch(() => null));
  const renamed: StaleRoleLabel[] = [];
  const failed: StaleRoleLabel[] = [];

  for (const change of stale) {
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/UpdateOptionValue`, {
      method: "POST",
      headers: actionHeaders(token),
      body: JSON.stringify({
        EntityLogicalName: USER_PROFILE_LOGICAL_NAME,
        AttributeLogicalName: `${PUBLISHER_PREFIX}_role`,
        Value: ROLE_VALUES[change.role],
        Label: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: change.to,
              LanguageCode: 1033,
            },
          ],
        },
        MergeLabels: true,
      }),
    });

    if (response.ok) {
      console.log(`[Setup API] Renamed the ${change.from} option of hi_role to ${change.to}`);
      renamed.push(change);
    } else {
      const reason = await response.text();
      console.error(`[Setup API] Could not rename the ${change.from} option: ${reason.slice(0, 300)}`);
      failed.push(change);
    }
  }

  if (renamed.length === 0) return { renamed, failed, published: false };

  /* Without a publish the metadata read above still answers the old label, so
     the card would offer this rename again after it had been done. */
  const publish = await fetch(`${DATAVERSE_URL}/api/data/v9.2/PublishXml`, {
    method: "POST",
    headers: actionHeaders(token),
    body: JSON.stringify({
      ParameterXml: `<importexportxml><entities><entity>${USER_PROFILE_LOGICAL_NAME}</entity></entities></importexportxml>`,
    }),
  });
  if (!publish.ok) {
    console.error(`[Setup API] Publishing the user table failed: ${(await publish.text()).slice(0, 300)}`);
  }

  return { renamed, failed, published: publish.ok };
}
