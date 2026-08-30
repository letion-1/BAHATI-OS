import { describe, expect, it } from "vitest";

import { resolveAccessProfile } from "@/lib/data-sources/importer/access-profiles";

describe("resolveAccessProfile", () => {
  it("treats an unclassified source as reference, not as sellable", () => {
    /*
     * The whole point of the change. Before, a source with no classification
     * produced yachts the proposal route happily offered to clients.
     */
    const profile = resolveAccessProfile(null);

    expect(profile.accessType).toBe("reference");
    expect(profile.clientProposalPermission).toBe(false);
    expect(profile.isUnclassified).toBe(true);
  });

  it("treats an unrecognised access type as unclassified", () => {
    // A typo or a value from a future migration must not fall through to
    // permissive behaviour.
    const profile = resolveAccessProfile({
      access_type: "sort_of_ours",
      calendar_authority: null,
      booking_model: null,
    });

    expect(profile.clientProposalPermission).toBe(false);
    expect(profile.isUnclassified).toBe(true);
  });

  it("lets a controlled yacht be proposed and listed", () => {
    const profile = resolveAccessProfile({
      access_type: "controlled",
      calendar_authority: null,
      booking_model: null,
    });

    expect(profile.clientProposalPermission).toBe(true);
    expect(profile.publicListingPermission).toBe(true);
    expect(profile.bookingModel).toBe("direct");
    expect(profile.calendarAuthority).toBe("our_company");
  });

  it("lets a broker-access yacht be proposed but not publicly listed", () => {
    // A partner's yacht can go to a named client who asked. Putting it on a
    // public page would imply the brokerage represents it.
    const profile = resolveAccessProfile({
      access_type: "broker_access",
      calendar_authority: null,
      booking_model: null,
    });

    expect(profile.clientProposalPermission).toBe(true);
    expect(profile.publicListingPermission).toBe(false);
  });

  it("never lets a reference yacht reach a client", () => {
    const profile = resolveAccessProfile({
      access_type: "reference",
      calendar_authority: null,
      booking_model: null,
    });

    expect(profile.clientProposalPermission).toBe(false);
    expect(profile.publicListingPermission).toBe(false);
    expect(profile.bookingModel).toBe("reference_only");
  });

  it("keeps what the source states rather than substituting a default", () => {
    const profile = resolveAccessProfile({
      access_type: "managed",
      calendar_authority: "owner",
      booking_model: "direct",
    });

    expect(profile.calendarAuthority).toBe("owner");
    expect(profile.bookingModel).toBe("direct");
  });
});