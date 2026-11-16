"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useAuth } from "@/components/providers/AuthProvider";
import { isProfileId, type TrialAudience } from "@/lib/auth/ringi-preview";

export const RINGI_PREVIEW_URL = "/api/settings/ringi-preview";

interface PreviewData {
  enabled: boolean;
  isMember: boolean;
  readable: boolean;
  memberAddresses: string[] | null;
  memberIds: string[] | null;
}

const fetcher = async (url: string): Promise<PreviewData> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  // JSON is `unknown` until looked at (rule 12).
  const strings = (value: unknown): string[] | null =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : null;
  return {
    enabled: data.enabled === true,
    isMember: data.isMember === true,
    readable: data.readable !== false,
    memberAddresses: strings(data.memberAddresses),
    memberIds: strings(data.memberIds)?.filter(isProfileId).map((id) => id.toLowerCase()) ?? null,
  };
};

/**
 * **The Ringi preview, for this caller** (`lib/auth/ringi-preview`).
 *
 * `blocked` is true only once the server has said so: while the setting loads
 * - or when it cannot be read - the ringi stays where it was, because a menu
 * entry flashing away from a trial member is worse than one that stays a
 * moment too long, and the server refuses every write regardless (rule 43's
 * shape, rule 2).
 *
 * `audience` is what a ringi mail is marked against, and it goes the other
 * way: until the server has answered, it is `"unknown"`, which marks.
 */
export function useRingiPreview() {
  const { isAuthenticated } = useAuth();
  const { data, error, isLoading, mutate } = useSWR(isAuthenticated ? RINGI_PREVIEW_URL : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60 * 1000,
  });

  const audience: TrialAudience = useMemo(() => {
    if (!data) return "unknown";
    if (!data.enabled) return null;
    return data.memberAddresses ?? "unknown";
  }, [data]);

  return {
    enabled: data?.enabled ?? false,
    blocked: Boolean(data?.enabled && !data.isMember),
    /** Admins only: the ticked profiles. */
    memberIds: data?.memberIds ?? null,
    readable: error ? false : data?.readable ?? true,
    audience,
    isLoading,
    mutate: () => mutate(),
  };
}
