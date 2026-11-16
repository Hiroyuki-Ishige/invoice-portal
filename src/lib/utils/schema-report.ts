/**
 * The shape the Setup page draws its schema tables from.
 *
 * Every Setup card answers the same question - does this table have the columns
 * the app writes to - so they answer it in one shape. The list is built from the
 * very definitions each route would send, so the table on screen cannot drift
 * from what the repair button does.
 */
export interface SchemaColumn {
  /** Logical name, lower case, as Dataverse stores it. */
  name: string;
  /** The column's display name - what an operator sees in Power Apps. */
  label: string;
  /** Friendly type, e.g. "String", "Choice", "Yes/No". */
  type: string;
  /**
   * Whether the table actually has it. `null` when the metadata could not be
   * read: "could not ask" is not "absent", and a table shown as missing every
   * column it has would send an operator somewhere pointless.
   */
  present: boolean | null;
}

/** What a definition's `@odata.type` means in the words the schema table uses. */
const TYPE_LABELS: Record<string, string> = {
  StringAttributeMetadata: "String",
  MemoAttributeMetadata: "Memo",
  PicklistAttributeMetadata: "Choice",
  BooleanAttributeMetadata: "Yes/No",
  DateTimeAttributeMetadata: "DateTime",
  MoneyAttributeMetadata: "Money",
  IntegerAttributeMetadata: "Whole Number",
  DecimalAttributeMetadata: "Decimal",
  DoubleAttributeMetadata: "Float",
  LookupAttributeMetadata: "Lookup",
};

/**
 * "Microsoft.Dynamics.CRM.StringAttributeMetadata" -> "String".
 *
 * Falls back to the trimmed type name rather than a blank cell: an unmapped
 * type is still worth showing, and a blank reads as a bug in the page.
 */
export function friendlyAttributeType(odataType: string): string {
  const bare = odataType.split(".").pop() ?? odataType;
  return TYPE_LABELS[bare] ?? bare.replace(/AttributeMetadata$/, "");
}

/**
 * The shape a column definition needs to be describable.
 *
 * Deeply readonly, because the routes declare their lists `as const` - a mutable
 * parameter type would reject the very literals this exists to read.
 */
export interface ColumnDefinitionLike {
  readonly "@odata.type": string;
  readonly SchemaName: string;
  readonly DisplayName?: {
    readonly LocalizedLabels?: ReadonlyArray<{ readonly Label: string }>;
  };
}

/** The English label off a Dataverse metadata definition, if it carries one. */
export function definitionLabel(definition: ColumnDefinitionLike): string {
  return definition.DisplayName?.LocalizedLabels?.[0]?.Label ?? definition.SchemaName;
}

/**
 * Turns the definitions a route would send into the rows the page draws.
 *
 * `present` is looked up in the set of logical names actually on the table;
 * pass `null` for that set when the metadata could not be read.
 */
export function describeColumns(
  definitions: ReadonlyArray<ColumnDefinitionLike>,
  presentNames: Set<string> | null
): SchemaColumn[] {
  return definitions.map((definition) => {
    const name = definition.SchemaName.toLowerCase();
    return {
      name,
      label: definitionLabel(definition),
      type: friendlyAttributeType(definition["@odata.type"]),
      present: presentNames ? presentNames.has(name) : null,
    };
  });
}
