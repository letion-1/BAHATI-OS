"server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function generateProposalShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashProposalShareToken(token: string): string {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export function isPlausibleProposalShareToken(
  value: unknown
): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}