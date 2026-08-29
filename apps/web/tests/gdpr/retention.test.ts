import { describe, expect, it } from "vitest";

import {
  RETENTION_YEARS_ACCOUNTING_RECORDS,
  RETENTION_YEARS_ACCOUNTS,
  RETENTION_YEARS_CORRESPONDENCE,
  isRetentionExpired,
  retentionUntil,
} from "@/lib/gdpr/retention";

describe("retentionUntil", () => {
  it("runs from the end of the calendar year, not the document date", () => {
    // §147(4) AO. A March invoice does not expire in March eight years later;
    // the clock starts on 31 December of the year it arose.
    const expiry = retentionUntil(
      new Date("2026-03-14T00:00:00Z"),
      RETENTION_YEARS_ACCOUNTING_RECORDS
    );

    expect(expiry.toISOString().slice(0, 10)).toBe("2034-12-31");
  });

  it("treats a document dated 31 December the same as one in January", () => {
    const december = retentionUntil(
      new Date("2026-12-31T00:00:00Z"),
      RETENTION_YEARS_CORRESPONDENCE
    );

    const january = retentionUntil(
      new Date("2026-01-02T00:00:00Z"),
      RETENTION_YEARS_CORRESPONDENCE
    );

    expect(december.toISOString()).toBe(january.toISOString());
  });

  it("carries the periods the statutes actually set", () => {
    expect(RETENTION_YEARS_ACCOUNTS).toBe(10);
    // Shortened from 10 by the Viertes Bürokratieentlastungsgesetz, in force
    // from 1 January 2025.
    expect(RETENTION_YEARS_ACCOUNTING_RECORDS).toBe(8);
    expect(RETENTION_YEARS_CORRESPONDENCE).toBe(6);
  });
});

describe("isRetentionExpired", () => {
  it("keeps a record whose period has not run out", () => {
    expect(
      isRetentionExpired("2034-12-31", new Date("2026-08-29T00:00:00Z"))
    ).toBe(false);
  });

  it("releases a record on the day the period ends", () => {
    expect(
      isRetentionExpired("2026-08-29", new Date("2026-08-29T00:00:00Z"))
    ).toBe(true);
  });

  it("treats an unclassified record as still retained", () => {
    // A null retention date means nobody has decided what the record is.
    // Deleting on that basis would be deleting on an assumption.
    expect(isRetentionExpired(null)).toBe(false);
  });
});