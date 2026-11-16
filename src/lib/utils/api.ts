/**
 * API Utilities
 *
 * Common utilities for API routes including error handling and response formatting.
 */

import { NextResponse } from "next/server";
import { DataverseError } from "@/lib/providers/dataverse/client";
import { handleApiError } from "@/lib/utils/api-helpers";

/**
 * Create a sanitized error response.
 * In production, only returns generic error messages to prevent information leakage.
 * In development, includes detailed error information for debugging.
 */
export function createErrorResponse(
  error: unknown,
  publicMessage: string,
  status: number
): NextResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // A refusal from Dataverse is not this app failing, and the caller-supplied
  // `status` here is always 500 - which is how an unprovisioned account came to
  // report "Internal server error" on every budget page. Defer to the shared
  // handler, which answers with what Dataverse actually said.
  if (error instanceof DataverseError) {
    return handleApiError(error, publicMessage);
  }

  // Always log the full error server-side
  console.error(`[API Error] ${publicMessage}:`, errorMessage);

  // In production, only return generic message
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: publicMessage }, { status });
  }

  // In development, include details for debugging
  return NextResponse.json(
    { error: publicMessage, details: errorMessage },
    { status }
  );
}

/**
 * Verify request origin for security.
 * Returns true if the origin is valid, false otherwise.
 */
export function verifyRequestOrigin(
  origin: string | null,
  host: string | null
): boolean {
  // In development, allow all origins
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // If no origin header, allow (same-origin request)
  if (!origin) {
    return true;
  }

  // Build list of allowed origins
  const allowedOrigins: string[] = [];

  // Allow same host
  if (host) {
    allowedOrigins.push(`https://${host}`);
    allowedOrigins.push(`http://${host}`); // For local development
  }

  // Allow production domain
  const productionUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (productionUrl) {
    allowedOrigins.push(productionUrl);
  }

  // Preview deployments get their host from Vercel and cannot be listed ahead
  // of time, so they are waved through - but by **which deployment this is**,
  // not by what the host looks like.
  //
  // This used to read `host?.includes("vercel.app")`, and production is
  // `capex-md.vercel.app`. So the one check standing in front of
  // `POST /api/auth/dataverse/token` returned true for every request in
  // production, for as long as it existed. `VERCEL_ENV` is set by the platform
  // to "production" | "preview" | "development" and is not something a request
  // can influence; a hostname is.
  if (process.env.VERCEL_ENV === "preview") {
    return true;
  }

  return allowedOrigins.includes(origin);
}
