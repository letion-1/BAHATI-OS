import "server-only";

/**
 * Prototype pollution guard for spreadsheet input.
 *
 * xlsx@0.18.5 carries a known prototype pollution vulnerability
 * (GHSA-4r6h-8v6p-xvw6). 0.18.5 is the last release published to npm, because
 * SheetJS moved distribution to their own CDN, so `npm audit fix` cannot
 * resolve it and the advisory will remain open indefinitely.
 *
 * The exposure is real rather than theoretical here: this application parses
 * spreadsheets supplied by third-party yacht operators, which is exactly the
 * untrusted input the advisory concerns. A crafted workbook can introduce keys
 * such as `__proto__` or `constructor` into parsed objects, and assigning
 * through them mutates Object.prototype for the entire process. On a shared
 * server that affects every subsequent request, not just the one that parsed
 * the file.
 *
 * The proper fix is upgrading to the SheetJS CDN build. Until then, every
 * object produced by the parser passes through here and the dangerous keys are
 * removed. This is defence in depth, not a replacement for the upgrade.
 */

/** Keys that reach Object.prototype when assigned through. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively strips prototype-polluting keys from parsed spreadsheet data.
 *
 * Returns a new structure. The input is not modified, so a caller holding the
 * original is unaffected.
 */
export function sanitizeParsedValue<T>(value: T): T {
  return sanitize(value, 0) as T;
}

/** Depth cap, so a maliciously nested workbook cannot exhaust the stack. */
const MAX_DEPTH = 40;

function sanitize(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return null;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  if (value instanceof Date) {
    return value;
  }

  // A null-prototype object cannot be used to reach Object.prototype even if a
  // forbidden key survives, so the result is built on one.
  const clean = Object.create(null) as Record<string, unknown>;

  // Own enumerable keys only. Inherited properties are precisely what an
  // attacker would be trying to introduce.
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue;
    }

    clean[key] = sanitize(
      (value as Record<string, unknown>)[key],
      depth + 1
    );
  }

  // Restored to a normal prototype so downstream code that expects a plain
  // object (spread, JSON.stringify, property access) behaves as usual.
  return Object.assign({}, clean);
}

/**
 * True when the value contains a prototype-polluting key at any depth.
 * Used by tests and available for logging a suspicious source file.
 */
export function containsPollutionKeys(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsPollutionKeys(item, depth + 1));
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return true;
    }

    if (
      containsPollutionKeys(
        (value as Record<string, unknown>)[key],
        depth + 1
      )
    ) {
      return true;
    }
  }

  return false;
}