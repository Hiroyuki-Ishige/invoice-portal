/**
 * **Which navigation property a lookup field is bound through** - the one
 * answer, cached, for every table this app writes.
 *
 * A `@odata.bind` names the *navigation property* (`hi_Item`), not the lookup
 * field (`hi_item`), and Dataverse is the only thing that knows the mapping.
 * `.claude/rules/dataverse.md` has the failure it prevents: bind by the field
 * name and the create is refused; bind by `_value` and it is ignored.
 *
 * Two copies of this lived in `api/dataverse/items` and `api/dataverse/schedules`
 * until 2026-08-30 - the same request written twice, differing only in which
 * one remembered to sanitise the entity name (rule 20).
 *
 * **Cached for the life of the process, and shared across callers.** This is
 * *schema*: it is the same answer for every user of this app, it changes only
 * when somebody edits the table in Dataverse, and it was being re-fetched on
 * every single create - a round trip to a metadata endpoint before every saved
 * schedule and every saved item. That makes it unlike `cache/reference-data.ts`,
 * which is keyed per caller precisely because it holds *data* a security role
 * decides the shape of (rule 17). A relationship map grants nothing and hides
 * nothing.
 *
 * A failed read is **not** cached: it answers an empty map so the caller can
 * fall back, and the next request asks again rather than inheriting one bad
 * minute for the life of the lambda.
 */

import { sanitizeODataString } from "./client";

const API_VERSION = "v9.2";

interface RelationshipMetadata {
  SchemaName: string;
  ReferencingAttribute: string;
  ReferencedEntity: string;
  ReferencingEntityNavigationPropertyName: string;
}

/** Logical entity name -> (lookup field -> navigation property). */
const cache = new Map<string, Map<string, string>>();

export async function getNavigationPropertyNames(
  token: string,
  entityLogicalName: string
): Promise<Map<string, string>> {
  const cached = cache.get(entityLogicalName);
  if (cached) return cached;

  const baseUrl = process.env.NEXT_PUBLIC_DATAVERSE_URL;
  const url =
    `${baseUrl}/api/data/${API_VERSION}/EntityDefinitions(LogicalName='` +
    `${sanitizeODataString(entityLogicalName)}')?$expand=ManyToOneRelationships` +
    `($select=SchemaName,ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.error(
      `[Dataverse] Could not read the relationships of ${entityLogicalName}:`,
      await response.text()
    );
    // Deliberately not cached - see the note at the top.
    return new Map();
  }

  const data = (await response.json()) as { ManyToOneRelationships?: RelationshipMetadata[] };
  const navProps = new Map<string, string>();
  for (const rel of data.ManyToOneRelationships ?? []) {
    const navPropName = rel.ReferencingEntityNavigationPropertyName || rel.SchemaName;
    navProps.set(rel.ReferencingAttribute.toLowerCase(), navPropName);
  }

  cache.set(entityLogicalName, navProps);
  return navProps;
}

/**
 * Forget the cached relationships.
 *
 * For **Admin > Setup**, which is the one thing in this app that changes a
 * table's shape: a column added there is a relationship this map may not have.
 */
export function clearNavigationPropertyCache(): void {
  cache.clear();
}
