import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptEmailToken,
  encryptEmailToken,
  verifyEmailOAuthState,
} from "@/lib/email/token-crypto";
import {
  exchangeGoogleAuthorizationCode,
  getGoogleUserInfo,
  GOOGLE_EMAIL_SCOPES,
} from "@/lib/email/google";
import {
  getCurrentWorkspace,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const oauthError =
    url.searchParams.get("error");

  const code =
    url.searchParams.get("code");

  const state =
    url.searchParams.get("state");

  try {
    if (oauthError) {
      throw new Error(
        `Google authorization was not completed: ${oauthError}`
      );
    }

    if (!code || !state) {
      throw new Error(
        "Google did not return the required authorization details."
      );
    }

    const statePayload =
      verifyEmailOAuthState(state);

    const workspace =
      await getCurrentWorkspace();

    if (
      workspace.companyId !==
        statePayload.companyId ||
      workspace.userId !==
        statePayload.userId
    ) {
      throw new Error(
        "Google connection does not match the active Bahari OS workspace."
      );
    }

    const admin =
      createAdminClient();

    const tokens =
      await exchangeGoogleAuthorizationCode(
        code
      );

    const account =
      await getGoogleUserInfo(
        tokens.access_token!
      );

    const existingResult = await admin
      .from("email_connections")
      .select(
        "id, refresh_token_encrypted"
      )
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("provider", "gmail")
      .maybeSingle();

    if (existingResult.error) {
      throw new Error(
        `Could not inspect existing Gmail connection: ${existingResult.error.message}`
      );
    }

    let refreshToken =
      tokens.refresh_token ?? null;

    if (
      !refreshToken &&
      existingResult.data
        ?.refresh_token_encrypted
    ) {
      refreshToken =
        decryptEmailToken(
          existingResult.data
            .refresh_token_encrypted
        );
    }

    if (!refreshToken) {
      throw new Error(
        "Google did not provide a refresh token. Disconnect the Google authorization and connect again."
      );
    }

    const now =
      new Date().toISOString();

    const tokenExpiresAt =
      new Date(
        Date.now() +
          (tokens.expires_in ?? 3600) *
            1000
      ).toISOString();

    const upsertResult = await admin
      .from("email_connections")
      .upsert(
        {
          company_id:
            workspace.companyId,
          provider: "gmail",
          provider_account_id:
            account.providerAccountId,
          email_address:
            account.email,
          access_token_encrypted:
            encryptEmailToken(
              tokens.access_token!
            ),
          refresh_token_encrypted:
            encryptEmailToken(
              refreshToken
            ),
          token_expires_at:
            tokenExpiresAt,
          scopes:
            tokens.scope
              ?.split(/\s+/)
              .filter(Boolean) ??
            GOOGLE_EMAIL_SCOPES,
          status: "connected",
          created_by:
            workspace.userId,
          updated_at: now,
          last_used_at: now,
        },
        {
          onConflict:
            "company_id,provider",
        }
      )
      .select("id")
      .single();

    if (upsertResult.error) {
      throw new Error(
        `Could not save Gmail connection: ${upsertResult.error.message}`
      );
    }

    return NextResponse.redirect(
      new URL(
        `${statePayload.returnTo}?connected=gmail`,
        getAppOrigin()
      )
    );
  } catch (error) {
    console.error(
      "Google email callback error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not connect Gmail.";

    return NextResponse.redirect(
      new URL(
        `/email?oauthError=${encodeURIComponent(
          message
        )}`,
        getAppOrigin()
      )
    );
  }
}

function getAppOrigin(): string {
  const redirectUri =
    process.env.GOOGLE_EMAIL_REDIRECT_URI;

  if (redirectUri) {
    try {
      return new URL(
        redirectUri
      ).origin;
    } catch {
      // Continue to fallback.
    }
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}