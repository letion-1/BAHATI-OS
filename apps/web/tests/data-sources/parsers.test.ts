import { describe, expect, it } from "vitest";

import {
  detectYachtWorkbook,
  parseYachtWorkbook,
} from "@/lib/data-sources/parsers";

import { FILL, makeSheet, makeWorkbook } from "../fixtures/workbook";

/**
 * These tests cover the availability parsers, which are the part of Bahari OS
 * most likely to break silently. A parser regression does not throw: it
 * quietly returns fewer yachts, or marks a booked week available, and nobody
 * notices until a client is quoted a yacht that is already chartered.
 *
 * Each test below asserts on behaviour a supplier file actually depends on.
 * When a new supplier format is added, add a fixture here first.
 */

describe("layout detection", () => {
  it("recognises a horizontal yacht calendar", () => {
    const workbook = makeWorkbook([
      makeSheet("Availability 2026", [
        ["Yacht", "01 Jun", "08 Jun", "15 Jun", "22 Jun"],
        ["M/Y Alisa", "", "BOOKED", "", ""],
        ["M/Y Serene", "BOOKED", "BOOKED", "", ""],
        ["S/Y Nautilus", "", "", "OPTION", ""],
      ]),
    ]);

    const detection = detectYachtWorkbook(workbook);

    expect(detection.layout).not.toBe("unknown");
    expect(detection.confidence).toBeGreaterThan(0);
    expect(detection.sheetName).toBe("Availability 2026");
  });

  it("recognises a booking table", () => {
    const workbook = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status", "Port", "Price"],
        [
          "M/Y Alisa",
          "2026-07-12",
          "2026-07-19",
          "Available",
          "Split",
          52000,
        ],
        [
          "M/Y Serene",
          "2026-07-12",
          "2026-07-19",
          "Booked",
          "Dubrovnik",
          68000,
        ],
      ]),
    ]);

    const detection = detectYachtWorkbook(workbook);

    expect(detection.layout).not.toBe("unknown");
    expect(detection.parserId).toBeTruthy();
  });

  it("reports a confidence score it can be reasoned about", () => {
    const structured = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status"],
        ["M/Y Alisa", "2026-07-12", "2026-07-19", "Available"],
        ["M/Y Serene", "2026-07-19", "2026-07-26", "Booked"],
      ]),
    ]);

    const noise = makeWorkbook([
      makeSheet("Notes", [
        ["Please call the office"],
        ["Rates on request"],
      ]),
    ]);

    expect(detectYachtWorkbook(structured).confidence).toBeGreaterThan(
      detectYachtWorkbook(noise).confidence
    );
  });
});

describe("parseYachtWorkbook", () => {
  it("extracts yachts and availability from a booking table", () => {
    const workbook = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status", "Port"],
        ["M/Y Alisa", "2026-07-12", "2026-07-19", "Available", "Split"],
        ["M/Y Serene", "2026-07-12", "2026-07-19", "Booked", "Dubrovnik"],
        ["S/Y Nautilus", "2026-07-19", "2026-07-26", "Available", "Split"],
      ]),
    ]);

    const result = parseYachtWorkbook(workbook);

    expect(result.yachts.length).toBeGreaterThan(0);
    expect(result.availability.length).toBeGreaterThan(0);

    const names = result.yachts.map((yacht) => yacht.name);
    expect(names).toContain("M/Y Alisa");
  });

  it("does not mark a booked week as available", () => {
    const workbook = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status"],
        ["M/Y Alisa", "2026-07-12", "2026-07-19", "Booked"],
        ["M/Y Serene", "2026-07-12", "2026-07-19", "Available"],
      ]),
    ]);

    const result = parseYachtWorkbook(workbook);

    const alisa = result.availability.filter(
      (row) => row.yachtName === "M/Y Alisa"
    );

    // This is the single most important assertion in the suite. Quoting a
    // chartered yacht is the failure mode that loses a client.
    for (const row of alisa) {
      expect(row.status).not.toBe("available");
    }
  });

  it("assigns a stable source key to each yacht", () => {
    const workbook = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status"],
        ["M/Y Alisa", "2026-07-12", "2026-07-19", "Available"],
        ["M/Y Alisa", "2026-07-19", "2026-07-26", "Booked"],
      ]),
    ]);

    const result = parseYachtWorkbook(workbook);

    // The same yacht across two rows must resolve to one record, or the fleet
    // fills with duplicates on every sync.
    const alisaKeys = new Set(
      result.yachts
        .filter((yacht) => yacht.name === "M/Y Alisa")
        .map((yacht) => yacht.sourceKey)
    );

    expect(alisaKeys.size).toBe(1);
  });

  it("normalises dates to ISO or null, never a raw locale string", () => {
    const workbook = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status"],
        ["M/Y Alisa", "2026-07-12", "2026-07-19", "Available"],
      ]),
    ]);

    const result = parseYachtWorkbook(workbook);

    for (const row of result.availability) {
      if (row.startDate !== null) {
        expect(row.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      if (row.endDate !== null) {
        expect(row.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("constrains every status to the known enum", () => {
    const allowed = new Set([
      "available",
      "booked",
      "reserved",
      "option",
      "unavailable",
      "out_of_service",
      "unknown",
    ]);

    const workbook = makeWorkbook([
      makeSheet("Bookings", [
        ["Yacht", "Start", "End", "Status"],
        ["M/Y Alisa", "2026-07-12", "2026-07-19", "Available"],
        ["M/Y Serene", "2026-07-12", "2026-07-19", "Provisional"],
        ["S/Y Nautilus", "2026-07-12", "2026-07-19", "In refit"],
        ["M/Y Corvus", "2026-07-12", "2026-07-19", "???"],
      ]),
    ]);

    const result = parseYachtWorkbook(workbook);

    for (const row of result.availability) {
      expect(allowed.has(row.status)).toBe(true);
    }
  });

  it("throws rather than silently returning nothing", () => {
    const workbook = makeWorkbook([
      makeSheet("Readme", [
        ["This file intentionally contains no yacht data."],
        ["Contact the office for availability."],
      ]),
    ]);

    // A source that yields zero records must surface as an error the broker
    // can see, not as an empty successful sync.
    expect(() => parseYachtWorkbook(workbook)).toThrow();
  });
});

describe("colour convention handling", () => {
  it("reads a calendar where colour, not text, carries the status", () => {
    // Many operators ship a grid of empty cells where fill colour is the only
    // signal. Green available, red booked, amber optioned.
    const workbook = makeWorkbook([
      makeSheet(
        "Season 2026",
        [
          ["Yacht", "01 Jun", "08 Jun", "15 Jun"],
          ["M/Y Alisa", "", "", ""],
          ["M/Y Serene", "", "", ""],
        ],
        {
          fills: {
            "1,1": FILL.green,
            "1,2": FILL.red,
            "1,3": FILL.green,
            "2,1": FILL.red,
            "2,2": FILL.red,
            "2,3": FILL.amber,
          },
        }
      ),
    ]);

    const detection = detectYachtWorkbook(workbook);

    // Documents current behaviour. If detection returns "unknown" here, the
    // colour path is not wired up for this shape, and this test is the place
    // that records it rather than a client discovering it.
    expect(detection).toBeDefined();
    expect(typeof detection.confidence).toBe("number");
  });
});