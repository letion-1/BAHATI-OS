import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens for public charter contract links.
 *
 * Deliberately identical in shape to lib/proposal/share-token.ts. Two link
 * types with two different token formats would mean two sets of validation
 * rules to keep correct, and the proposal one is already proven in the public
 * route.
 *
 * 32 bytes of randomness, base64url encoded so it survives a URL path
 * segment, a WhatsApp message and a copy-paste out of an email client without
 * escaping.
 */

const TOKEN_BYTES = 32;

/*
 * Matches what base64url encoding of 32 bytes actually produces, with room
 * either side. Checked before the database is touched, so a malformed or
 * probing request costs a regex rather than a query.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function generateContractShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Only the hash is stored. The raw token is shown to the broker once, at
 * creation, and cannot be recovered afterwards: a leaked database yields no
 * working links.
 */
export function hashContractShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPlausibleContractShareToken(
  value: unknown
): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}