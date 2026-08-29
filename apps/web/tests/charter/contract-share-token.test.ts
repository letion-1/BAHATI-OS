import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  generateContractShareToken,
  hashContractShareToken,
  isPlausibleContractShareToken,
} from "@/lib/charter/contract-share-token";

describe("contract share tokens", () => {
  it("generates URL-safe tokens that pass their own validator", () => {
    for (let index = 0; index < 25; index += 1) {
      const token = generateContractShareToken();

      expect(isPlausibleContractShareToken(token)).toBe(true);

      // Must survive a URL path segment, a WhatsApp message and a paste.
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("never repeats a token", () => {
    const tokens = new Set(
      Array.from({ length: 500 }, () => generateContractShareToken())
    );

    expect(tokens.size).toBe(500);
  });

  it("stores a SHA-256 hash, not the token", () => {
    const token = generateContractShareToken();
    const hash = hashContractShareToken(token);

    expect(hash).toBe(
      createHash("sha256").update(token, "utf8").digest("hex")
    );
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it("hashes deterministically so lookup by hash works", () => {
    const token = generateContractShareToken();

    expect(hashContractShareToken(token)).toBe(
      hashContractShareToken(token)
    );
  });

  it("rejects values that could not be a token", () => {
    expect(isPlausibleContractShareToken("")).toBe(false);
    expect(isPlausibleContractShareToken("short")).toBe(false);
    expect(isPlausibleContractShareToken(null)).toBe(false);
    expect(isPlausibleContractShareToken(12345)).toBe(false);

    // Traversal and probing strings must fail before the database is touched.
    expect(isPlausibleContractShareToken("../../etc/passwd")).toBe(false);
    expect(isPlausibleContractShareToken("a".repeat(31))).toBe(false);
    expect(isPlausibleContractShareToken("a".repeat(129))).toBe(false);
  });
});