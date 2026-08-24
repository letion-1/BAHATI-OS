import { describe, expect, it } from "vitest";
import { buildInquiryExtractionInstructions } from "@/lib/ai/prompts/inquiry";

describe("buildInquiryExtractionInstructions", () => {
  it("anchors the model to today's date", () => {
    const prompt = buildInquiryExtractionInstructions(
      new Date("2026-08-24T00:00:00Z")
    );

    expect(prompt).toContain("Today's date is 2026-08-24");
    expect(prompt).toContain("The current year is 2026");
  });

  it("rolls a passed month forward to next year", () => {
    // August 2026: July has gone, so a bare "July" means July 2027.
    const prompt = buildInquiryExtractionInstructions(
      new Date("2026-08-24T00:00:00Z")
    );

    expect(prompt).toContain("means July 2027");
  });

  it("keeps a month still to come in the current year", () => {
    const prompt = buildInquiryExtractionInstructions(
      new Date("2026-03-01T00:00:00Z")
    );

    expect(prompt).toContain("means July 2026");
  });

  it("states the week-of-month and duration rules", () => {
    const prompt = buildInquiryExtractionInstructions(new Date());

    expect(prompt).toContain("'The second week of <month>' means the 8th to the 14th.");
    expect(prompt).toContain("7 nights from 2027-07-08 ends 2027-07-15");
    expect(prompt).toContain("guests 10 and guests_min 8");
  });
});