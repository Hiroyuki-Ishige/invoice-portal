"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { UserSearchSelect, type Office365User } from "@/components/ui/UserSearchSelect";
import { useAuth } from "@/components/providers/AuthProvider";
import { isImeComposing } from "@/lib/utils/ime";

const FIELD =
  "flex-1 min-w-0 rounded-md border border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm";

interface Person {
  name: string;
  jobTitle: string;
}

/**
 * What the directory said about an address, kept for the life of the page: `null` is "looked,
 * and it is not a person" (a shared mailbox), which must not be asked again on every render.
 */
const directoryCache = new Map<string, Person | null>();

/** The address of a directory person - the same order the rest of the app reads it in. */
const addressOf = (user: Office365User): string => (user.mail || user.email || user.userPrincipalName || "").trim();

interface Props {
  label: string;
  addresses: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * A list of mail recipients: the people already on it as chips, a directory search to add
 * somebody from the list of Microsoft 365 users, and a small field for an address the
 * directory does not list (a shared mailbox, a group).
 *
 * Only addresses are stored. The name and job title on each chip are read from the directory,
 * so they are there after a reload too; an address the directory does not know shows alone.
 */
export function RecipientPicker({ label, addresses, onChange, disabled = false }: Props) {
  const { getGraphAccessToken } = useAuth();
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [typed, setTyped] = useState("");

  /* Only addresses are stored, so a name and a title are asked of the directory - for what is on
     the list now, once each. A failure leaves the chip with its address alone. */
  const unknown = addresses.filter((a) => !(a.toLowerCase() in people) && !directoryCache.has(a.toLowerCase()));
  const lookupKey = unknown.join("|").toLowerCase();
  useEffect(() => {
    if (!lookupKey) return;
    let cancelled = false;
    (async () => {
      const token = await getGraphAccessToken().catch(() => null);
      if (!token) return;
      const found: Record<string, Person> = {};
      for (const address of lookupKey.split("|")) {
        const safe = address.replace(/'/g, "''");
        try {
          const response = await fetch(
            `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(`mail eq '${safe}' or userPrincipalName eq '${safe}'`)}&$select=displayName,jobTitle&$top=1`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!response.ok) continue;
          const data = (await response.json()) as { value?: Array<{ displayName?: string; jobTitle?: string | null }> };
          const hit = data.value?.[0];
          if (hit?.displayName) {
            directoryCache.set(address, { name: hit.displayName, jobTitle: hit.jobTitle ?? "" });
            found[address] = directoryCache.get(address)!;
          } else {
            directoryCache.set(address, null);
          }
        } catch {
          // Not cached: a network failure is not "not a person".
        }
      }
      if (!cancelled && Object.keys(found).length > 0) setPeople((all) => ({ ...all, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [lookupKey, getGraphAccessToken]);
  const personOf = (address: string): Person | null =>
    people[address.toLowerCase()] ?? directoryCache.get(address.toLowerCase()) ?? null;

  const has = (address: string) => addresses.some((a) => a.toLowerCase() === address.toLowerCase());
  const add = (address: string, person?: Person) => {
    const clean = address.trim();
    if (!clean || has(clean)) return;
    if (person) {
      directoryCache.set(clean.toLowerCase(), person);
      setPeople((all) => ({ ...all, [clean.toLowerCase()]: person }));
    }
    onChange([...addresses, clean]);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>

      {addresses.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {addresses.map((address) => {
            const person = personOf(address);
            return (
              <li
                key={address}
                className="flex items-center gap-2 rounded-lg border border-[#0057BC]/30 bg-[#0057BC]/10 text-[#0057BC] dark:border-[#00A3DE]/40 dark:bg-[#00A3DE]/15 dark:text-[#00A3DE] pl-3 pr-1.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1">
                  {person && <span className="block truncate font-semibold text-sm">{person.name}</span>}
                  {person?.jobTitle && <span className="block truncate">{person.jobTitle}</span>}
                  <span className="block truncate" title={address}>
                    {address}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${address}`}
                  onClick={() => onChange(addresses.filter((a) => a !== address))}
                  className="shrink-0 rounded-full p-1 hover:bg-[#0057BC]/20 dark:hover:bg-[#00A3DE]/25 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Always empty after a pick, so the next person can be searched straight away. */}
      <UserSearchSelect
        selectedUser={null}
        onSelect={(user) => {
          if (user) add(addressOf(user), { name: user.displayName, jobTitle: user.jobTitle ?? "" });
        }}
        getAccessToken={getGraphAccessToken}
        placeholder="Search Microsoft 365 users to add..."
        leadIcon="plus"
        disabled={disabled}
        compact
      />

      <div className="flex items-center gap-2">
        <input
          type="email"
          className={FIELD}
          value={typed}
          disabled={disabled}
          placeholder="Or type an address not in the list"
          aria-label={`${label}: add an address`}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || isImeComposing(e)) return;
            e.preventDefault();
            add(typed);
            setTyped("");
          }}
        />
        <button
          type="button"
          disabled={disabled || !typed.trim()}
          onClick={() => {
            add(typed);
            setTyped("");
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-900 dark:border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </div>
  );
}
