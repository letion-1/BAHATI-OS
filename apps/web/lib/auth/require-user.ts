import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  phone: string | null;
  role: string;
  isAnonymous: boolean;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
};

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";
  readonly status = 401;

  constructor(message = "You must sign in to continue.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

/**
 * Verifies the Supabase access token attached to the current request and
 * returns the minimal authenticated-user data required by the application.
 *
 * The result is memoized for the current React server render so pages and
 * data-access helpers can call this function without repeatedly verifying the
 * same token.
 */
export const requireUser = cache(async (): Promise<AuthenticatedUser> => {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    throw new AuthenticationRequiredError();
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    phone: typeof claims.phone === "string" ? claims.phone : null,
    role: typeof claims.role === "string" ? claims.role : "authenticated",
    isAnonymous: claims.is_anonymous === true,
    appMetadata: toRecord(claims.app_metadata),
    userMetadata: toRecord(claims.user_metadata),
  };
});

export function isAuthenticationRequiredError(
  error: unknown
): error is AuthenticationRequiredError {
  return error instanceof AuthenticationRequiredError;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}