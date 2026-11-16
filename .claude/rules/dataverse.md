# Dataverse Provider Rules

**Applies to:** `src/lib/providers/**`

## Table Schema

All custom tables use the `hi_` prefix:

| Table | Entity Set | Primary Key |
|-------|------------|-------------|
| hi_budgetperiod | hi_budgetperiods | hi_budgetperiodid |
| hi_budgetquarter | hi_budgetquarters | hi_budgetquarterid |
| hi_entitycapex | hi_entitycapexes | hi_entitycapexid |
| hi_theme | hi_themes | hi_themeid |
| hi_capexitem | hi_capexitems | hi_capexitemid |
| hi_capexschedule | hi_capexschedules | hi_capexscheduleid |
| hi_scheduleamount | hi_scheduleamounts | hi_scheduleamountid |

## Field Naming Convention

```typescript
// App layer uses snake_case
const budgetData = { id, name, amount, budget_year };

// Dataverse uses hi_ prefix
// hi_budgetperiodid, hi_name, hi_amount, hi_budgetyear

// Lookup fields use _value suffix
// _hi_budgetyear_scheduleamount_value (NOT _hi_budgetyear_scheduleamountid_value)
```

## OData Query Patterns

### Select with Expand

```typescript
const query = `
  $select=hi_amount,hi_name
  &$expand=hi_schedule_scheduleamount(
    $select=hi_name,hi_ordinaryorextra;
    $expand=hi_Item($select=hi_name;
      $expand=hi_CAPEXTheme($select=hi_name)
    )
  )
`;
```

### Filter by Lookup

```typescript
// Correct - use _value suffix
$filter=_hi_budgetyear_scheduleamount_value eq '${yearGuid}'

// Wrong - do not use id suffix
$filter=_hi_budgetyear_scheduleamountid_value eq '${yearGuid}'
```

### Order By

```typescript
$orderby=hi_name asc
$orderby=hi_amount desc
```

## Security

### UUID Validation

Always validate GUIDs before using in queries:

```typescript
function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Before query
if (!validateUUID(yearId)) {
  throw new Error('Invalid year ID');
}
```

### OData String Sanitization

Escape single quotes to prevent injection:

```typescript
function sanitizeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

// Usage
const filter = `hi_name eq '${sanitizeODataString(userInput)}'`;
// "O'Brien" → "O''Brien"
```

## API Headers

```typescript
const headers = {
  "Authorization": `Bearer ${accessToken}`,
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  "Accept": "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "Prefer": "return=representation",
};
```

## Error Handling

```typescript
try {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired - trigger re-auth
      throw new AuthError('Token expired');
    }
    if (response.status === 403) {
      throw new AccessError('Access denied');
    }
    throw new DataverseError(`API error: ${response.status}`);
  }

  return await response.json();
} catch (error) {
  // Log and re-throw
  console.error('Dataverse query failed:', error);
  throw error;
}
```

## Creating Records with Lookup Bindings

When creating records that reference other tables (lookup fields), use `@odata.bind` with the correct **navigation property name**.

### Fetching Navigation Property Names

Navigation property names are NOT the same as field names. Query the metadata API to get them:

```typescript
async function getNavigationPropertyNames(
  token: string,
  entityLogicalName: string
): Promise<Map<string, string>> {
  const baseUrl = process.env.NEXT_PUBLIC_DATAVERSE_URL;
  const url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$expand=ManyToOneRelationships($select=SchemaName,ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName)`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  const navProps = new Map<string, string>();
  for (const rel of data.ManyToOneRelationships || []) {
    // Map: lookup field name → navigation property name
    // e.g., "hi_item" → "hi_Item"
    navProps.set(rel.ReferencingAttribute, rel.ReferencingEntityNavigationPropertyName);
  }
  return navProps;
}
```

### Using Navigation Properties for Create

```typescript
// Get navigation property names first
const navProps = await getNavigationPropertyNames(token, "hi_capexschedule");

// Build record with @odata.bind using navigation property names
const scheduleData = {
  hi_name: "Schedule Name",
  // Use navigation property (e.g., "hi_Item") not field name (e.g., "hi_item")
  [`${navProps.get("hi_item")}@odata.bind`]: `/hi_capexitems(${itemUuid})`,
  [`${navProps.get("hi_entitycapex")}@odata.bind`]: `/hi_entitycapexes(${entityUuid})`,
  hi_ordinaryorextra: 1,  // 1 = ordinary, 2 = extra
};

// POST to entity set
const response = await fetch(`${baseUrl}/api/data/v9.2/hi_capexschedules`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  },
  body: JSON.stringify(scheduleData),
});
```

### A 400 never says what is wrong in its status line

`"Response status code does not indicate success: 400 (Bad Request)"` is what the HTTP layer
gives you. **The sentence naming the column is in the response body**, which
`Invoke-RestMethod` hides in `$_.ErrorDetails.Message` and `fetch` leaves in `await
response.text()`. Read it, or a single wrong navigation property looks like 375 unrelated
failures - which is exactly what it looked like on 2026-09-13, when a migration failed on every
row and the logs said nothing but the status code 375 times.

**And stop after a handful.** Rows built the same way in a loop fail the same way; five in a
row is one bug, not five.

### A 403 names the privilege, and only in the body

The sibling of the section above, and it has cost more time than that one. A 403 from Dataverse
is not "access denied" - the body says exactly which privilege is missing:

```
Principal user (Id=..., type=8, roleCount=3, privilegeCount=812, accessMode=0),
is missing prvCreateAnnotation privilege (Id=...) on OTC=5 for entity 'annotation'.
```

or, for the association half of a write:

```
SecLib::AccessCheckEx failed. Returned hr = -2147187962, ObjectID: ..., AccessRights: AppendToAccess
```

**`handleApiError` is where this belongs, and it always could have been.** `DataverseError`
carries the body in `readonly detail`, and that function already reads it for its `details`
field - so one line there gives every Dataverse 403 in the app its privilege name. It words the
refusal for *every* route, and what it could say without the body is a list of five privileges
for the reader to try one at a time. That list has been tried, one at a time, three times in
two days: chasing a schedule's missing amounts on 2026-09-16, **Append To on Schedule Amount**
and then **Append To on CAPEX Schedule** were each proposed and ruled out by a screenshot before
`EntityDefinitions` gave the real answer - Read on **Currency**, because `hi_amount` is a Money
column. Dataverse had been naming `prvReadtransactioncurrency` in the response body the whole
time.

> An earlier version of this section said `handleApiError` "is handed a status, never a body".
> That was wrong, and it was wrong in the direction that matters - it would have sent the next
> reader past the one place worth changing, to patch routes one at a time instead. Caught in
> review the same day it was written. **Check the type before writing down what it cannot do.**

`lib/providers/dataverse/privilege-error.ts` (`privilegeAdvice()`) turns either wording into one
sentence naming the verb and the table, and answers `null` when the body named nothing -
including for `AccessRights: None`, which matches the pattern while naming neither. A `null`
lets the caller say what the write was and list only what that write could have needed (rule 6);
an empty object would have **silenced** that better sentence, which is how it was first written.

**A route that holds a raw `Response` rather than a thrown error calls it directly** - the
budget-explanation upload and delete, and the ringi attachment upload. Each adds the fallback
only it can write, because only it knows what the write was.

**A note is two privileges, not one.** `POST /annotations` with an `@odata.bind` to a custom
table needs **Create** (and Append) on `annotation` *and* **Append To** on the parent table -
so a role that can read and create `hi_itemexplanation` can still be refused the file that
hangs off it. That is the shape reported 2026-09-17.

### The `@odata.bind` name is NOT the `$expand` name, and the error says the opposite

The table below maps `hi_budgetyear` to **`hi_Budgetyear`**, which is correct for a write. Put
the same name in an `$expand` and Dataverse answers:

```
Could not find a property named 'hi_Budgetyear' on type 'Microsoft.Dynamics.CRM.hi_capexschedule'.
```

- a **400**, which a caller reads as "your save was malformed", not as "your read was".
  It shipped that way in `budget/iir-approval` and went unnoticed because nothing had pressed
  the button (CLAUDE.md rule 37); the same expression was copied into the schedule PATCH guard
  and failed on the first real click.

**Ask the lookup for its formatted value instead.** `queryDataverseRaw*` already sends
`Prefer: odata.include-annotations=*`, so the name of the thing a lookup points at arrives
with no `$expand` at all:

```ts
`hi_capexschedules?$select=hi_capexscheduleid,_hi_budgetyear_value,_hi_budgetquarter_value`
// row["_hi_budgetyear_value@OData.Community.Display.V1.FormattedValue"] -> "FY2026"
```

It is a **display string**, not a value this app knows, so narrow it before comparing
(`parseBudgetPeriod`) - and one that will not narrow is *not* a match (rule 6).

### Common Mistakes

```typescript
// ❌ Wrong - using field name directly
{ "hi_item@odata.bind": `/hi_capexitems(${uuid})` }

// ❌ Wrong - using _value suffix (read-only)
{ "_hi_item_value": uuid }

// ✅ Correct - using navigation property name from metadata
{ "hi_Item@odata.bind": `/hi_capexitems(${uuid})` }
```

### Lookup Field to Navigation Property Mapping (hi_capexschedule)

> **Re-read from `EntityDefinitions` on 2026-09-16, and three of these five had
> been written down wrong** - `hi_Budgetyear` for `hi_BudgetYear`, and so on.
> They were also the hardcoded fallbacks in the schedules POST, which is only
> reached when the metadata read returns an empty map; a fallback that can never
> work turns a diagnosable refusal into an intermittent one. **Ask the record**
> (rule 32) - and note the casing is not a pattern you can guess: `hi_Item` and
> `hi_PIC` do not follow the same rule as `hi_BudgetYear`.

| Lookup Field | Navigation Property | Target Entity |
|--------------|---------------------|---------------|
| hi_item | hi_Item | hi_capexitems |
| hi_entitycapex | **hi_EntityCapex** | hi_entitycapexes |
| hi_budgetyear | **hi_BudgetYear** | hi_budgetperiods |
| hi_budgetquarter | **hi_BudgetQuarter** | hi_budgetquarters |
| hi_pic | **hi_PIC** | systemusers |

**`hi_pic` on a schedule is a LOOKUP to `systemuser`, not a text column.** Both
writers were assigning a display name to it, which Dataverse refuses with a 400 -
and `handleApiError` suppresses the sentence naming the column in production, so
it reached the user as "Dataverse rejected the request" and nothing more. It only
failed when there was a PIC to write, which is how it survived a test on an item
that had none. `lib/budget/schedule-pic.ts` is the one thing that writes it now.

### `hi_amount` is a Money column, and that is a privilege

Asked of `EntityDefinitions` on 2026-09-16: `hi_scheduleamount.hi_amount` is **`Money`**, with
`hi_amount_base` generated beside it and a `transactioncurrencyid` lookup Dataverse fills in
by itself. `hi_capexschedule` has **no** Money column and no currency lookup.

So a security role can create a schedule and be refused its amounts, with everything on the
two tables' own rows granted. When that happens the column to look at is **Read on Currency
(`transactioncurrency`)**, not Create on Schedule Amount - which was already granted the day
this was chased.

### Lookup Field to Navigation Property Mapping (hi_scheduleamount)

These three really are lowercase - which is the point of asking rather than
applying the capitalisation seen above. The schedule PATCH hardcoded
`hi_Schedule_scheduleamount` with a capital S and answered 400 on every save that
added a figure to a quarter with no amount row yet; an edit of an existing figure
binds nothing, so it looked like only *some* saves were broken.
`lib/budget/schedule-amount-bind.ts` is the one spelling now.

| Lookup Field | Navigation Property |
|--------------|---------------------|
| hi_schedule_scheduleamount | hi_schedule_scheduleamount |
| hi_budgetyear_scheduleamount | hi_budgetyear_scheduleamount |
| hi_budgetquarter_scheduleamount | hi_budgetquarter_scheduleamount |

### Lookup Field to Navigation Property Mapping (hi_capexitem)

| Lookup Field | Navigation Property | Target Entity |
|--------------|---------------------|---------------|
| hi_capextheme | hi_CAPEXTheme | hi_themes |

### CAPEX Item Field Names (hi_capexitem)

> **CRITICAL:** Field names differ from display names. Using wrong field names causes `Could not find a property named 'X'` errors at runtime.

| Purpose | Field Name | NOT |
|---------|------------|-----|
| Item Name | `hi_itemname` | ~~hi_name~~, ~~hi_capexitemname~~ |
| Objective | `hi_objectiveoutcome` | ~~hi_objective~~ |
| Document URL | `hi_explanationdocumenturl` | |
| Memo | `hi_memo` | |
| Memo IIR | `hi_memo_iir` | |
| Payback | `hi_paybackmonth` | |
| ROI | `hi_roi` | |
| CAPEX/Repair | `hi_capexorrepair` | |
| PIC (Owner) | `_ownerid_value` | ~~hi_pic~~ (not on Item table) |

### Querying hi_capexitems

**Best Practice:** When querying hi_capexitems, avoid `$select` unless you've verified field names via metadata API. Fetching all columns is safer:

```typescript
// ✅ Safe - fetch all columns
queryDataverseRaw<Record<string, unknown>>(token, "hi_capexitems")

// ❌ Risky - may fail if field names are wrong
queryDataverseRaw(token, "hi_capexitems?$select=hi_name,hi_pic")  // These fields don't exist!
```

**PIC Field Note:** For hi_capexitem, PIC is the record owner (`_ownerid_value`), NOT a separate `hi_pic` field. Use the formatted value annotation:

```typescript
const pic = record["_ownerid_value@OData.Community.Display.V1.FormattedValue"] || "";
```

## Pagination

Handle `@odata.nextLink` for large datasets:

```typescript
async function getAllRecords(entitySet: string): Promise<any[]> {
  const allRecords: any[] = [];
  let nextLink = `${baseUrl}/api/data/v9.2/${entitySet}`;

  while (nextLink) {
    const response = await fetch(nextLink, { headers });
    const data = await response.json();

    allRecords.push(...data.value);
    nextLink = data['@odata.nextLink'];
  }

  return allRecords;
}
```

## Reference Data Caching

Use `src/lib/cache/reference-data.ts` for caching frequently accessed lookup data:

```typescript
import { getCachedReferenceData, clearReferenceDataCache } from "@/lib/cache/reference-data";

// GET handler - use cached data (5-minute TTL)
const refData = await getCachedReferenceData(token);
const yearId = refData.yearByName.get("FY2026");
const itemInfo = refData.itemMap.get(itemId);

// After POST/PATCH/DELETE - clear cache
clearReferenceDataCache();
```

**Cached Data:**
- `yearById` / `yearByName` - Budget periods (FY2023-FY2030)
- `quarterById` / `quarterByName` - Quarters (Q1-Q4)
- `themeByIdMap` - Theme records
- `itemMap` - Items with theme and PIC info

## Shared API Helpers

Use `src/lib/utils/api-helpers.ts` for consistent API responses:

```typescript
import {
  handleApiError,
  extractItemName,
  extractThemeName,
  extractPic,
  toKusd,
  debugLog,
  groupBy,
} from "@/lib/utils/api-helpers";

// Error handling (suppresses details in production)
return handleApiError(error, "Schedule API");

// Data extraction from Dataverse records
const name = extractItemName(item);  // hi_itemname (primary)
const theme = extractThemeName(item); // _hi_capextheme_value@...FormattedValue
const pic = extractPic(record);       // _ownerid_value@...FormattedValue (for items)

// Amount conversion (USD → KUSD)
const amount = toKusd(item.hi_amount); // /1000

// Development-only logging
debugLog("Schedule API", "Processing", count, "records");

// Efficient grouping
const bySchedule = groupBy(amounts, (a) => a._hi_schedule_value);
```

### Field Extraction Priority

```typescript
// extractItemName checks fields in order:
// 1. hi_itemname (correct for hi_capexitem)
// 2. "_hi_item_value@OData.Community.Display.V1.FormattedValue" (lookup annotation)
// 3. "hi_capexitemid@OData.Community.Display.V1.FormattedValue" (fallback)

// extractPic checks fields in order:
// 1. "_ownerid_value@OData.Community.Display.V1.FormattedValue" (record owner)
// 2. "_hi_pic_value@OData.Community.Display.V1.FormattedValue" (lookup field)
// 3. "hi_pic" (text field on Schedule)
```

## Budget Constants

Use `src/lib/constants/budget.ts` for type-safe budget values:

```typescript
import {
  FISCAL_YEARS,
  QUARTERS,
  BUDGET_TYPE,
  CAPEX_OR_REPAIR,
  getBudgetTypeName,
  getBudgetTypeValue,
  isValidAmountKey,
  isValidAmount,
} from "@/lib/constants/budget";

// Budget type conversion
const type = getBudgetTypeName(1);  // "ordinary"
const value = getBudgetTypeValue("extra");  // 2

// Filter by CAPEX only
$filter=hi_capexorrepair eq ${CAPEX_OR_REPAIR.CAPEX}  // 100000000

// Validate amount keys (e.g., "FY2026_Q1")
if (!isValidAmountKey(key)) { /* invalid */ }
if (!isValidAmount(value)) { /* invalid */ }
```
