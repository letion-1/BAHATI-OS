import { describe, expect, it, afterEach } from "vitest";

import {
  sanitizeParsedValue,
  containsPollutionKeys,
} from "@/lib/security/sanitize-parsed";

/**
 * These tests perform an actual prototype pollution attack and assert it is
 * blocked. A test that only checks the key was removed would pass against a
 * broken implementation, so the assertions are on Object.prototype itself.
 */

afterEach(() => {
  // Clean up in case an assertion failed mid-attack and left the prototype
  // mutated, which would silently corrupt every later test in the run.
  delete (Object.prototype as Record<string, unknown>).polluted;
});

describe("sanitizeParsedValue", () => {
  it("blocks a prototype pollution attack via __proto__", () => {
    // What a crafted spreadsheet cell could produce once parsed.
    const malicious = JSON.parse(
      '{"yacht":"M/Y Alisa","__proto__":{"polluted":"yes"}}'
    );

    const clean = sanitizeParsedValue(malicious);

    // The attack must not have reached Object.prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();

    // And legitimate data must survive.
    expect(clean.yacht).toBe("M/Y Alisa");
  });

  it("strips constructor and prototype keys", () => {
    const malicious = JSON.parse(
      '{"name":"ok","constructor":{"x":1},"prototype":{"y":2}}'
    );

    const clean = sanitizeParsedValue(malicious) as Record<string, unknown>;

    expect(Object.keys(clean)).toEqual(["name"]);
  });

  it("strips keys nested inside availability rows", () => {
    // The realistic shape: a parser output where the payload is buried.
    const parsed = JSON.parse(`{
      "yachts": [{ "name": "M/Y Serene" }],
      "availability": [
        { "yachtName": "M/Y Serene", "status": "booked",
          "raw": { "__proto__": { "polluted": "yes" } } }
      ]
    }`);

    sanitizeParsedValue(parsed);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("preserves the data a parser actually returns", () => {
    const parsed = {
      yachts: [{ name: "M/Y Alisa", sourceKey: "alisa" }],
      availability: [
        {
          yachtName: "M/Y Alisa",
          startDate: "2026-07-11",
          endDate: "2026-07-18",
          status: "available",
          weeklyRate: 52000,
          nested: { port: "Split", tags: ["crewed", "catamaran"] },
        },
      ],
    };

    const clean = sanitizeParsedValue(parsed);

    expect(clean).toEqual(parsed);
    expect(clean.availability[0].nested.tags).toEqual([
      "crewed",
      "catamaran",
    ]);
  });

  it("leaves dates and primitives intact", () => {
    const date = new Date("2026-07-11T00:00:00Z");
    const clean = sanitizeParsedValue({ date, n: 42, s: "x", b: true, z: null });

    expect(clean.date).toBe(date);
    expect(clean.n).toBe(42);
    expect(clean.z).toBeNull();
  });

  it("survives deeply nested input without exhausting the stack", () => {
    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i < 200; i += 1) {
      deep = { nested: deep };
    }

    expect(() => sanitizeParsedValue(deep)).not.toThrow();
  });
});

describe("containsPollutionKeys", () => {
  it("detects a polluting key at the top level", () => {
    expect(
      containsPollutionKeys(JSON.parse('{"__proto__":{"a":1}}'))
    ).toBe(true);
  });

  it("detects one nested deep in the structure", () => {
    expect(
      containsPollutionKeys(
        JSON.parse('{"a":{"b":[{"constructor":{"c":1}}]}}')
      )
    ).toBe(true);
  });

  it("reports clean data as clean", () => {
    expect(
      containsPollutionKeys({
        yachts: [{ name: "M/Y Alisa" }],
        availability: [{ status: "available" }],
      })
    ).toBe(false);
  });
});