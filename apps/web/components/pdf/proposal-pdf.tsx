import fs from "node:fs";
import path from "node:path";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export type ProposalPdfYacht = {
  id: string | null;
  position: number;
  name: string;
  weeklyRate: number | null;
  estimatedTotal: number | null;
  currency: string;
  availabilityStatus: string | null;
  verificationStatus: string | null;
  accessType: string | null;
  bookingModel: string | null;
  brokerNote: string | null;
  heroImageUrl: string | null;
  yachtType: string | null;
  builder: string | null;
  model: string | null;
  buildYear: number | null;
  lengthMeters: number | null;
  guestCapacity: number | null;
  sleepingGuests: number | null;
  cabinCount: number | null;
  homePort: string | null;
  cruisingRegions: string[];
};

export type ProposalPdfData = {
  reference: string;
  createdAt: string | null;
  client: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  charter: {
    startDate: string | null;
    endDate: string | null;
    guests: number | null;
    destination?: string | null;
  };
  yachts: ProposalPdfYacht[];
  notes: string | null;

  // Legacy compatibility while older saved proposals still exist.
  yacht?: {
    name: string;
  };
  commercial?: {
    weeklyRate: number | null;
    estimatedTotal: number | null;
    currency: string;
  };
};

type ProposalPdfProps = {
  proposal: ProposalPdfData;
  companyName?: string;
};

function imageDataUri(fileName: string): string | null {
  const absolutePath = path.join(
    process.cwd(),
    "public",
    "proposal-yacht",
    fileName
  );

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const file = fs.readFileSync(absolutePath);
  return `data:image/jpeg;base64,${file.toString("base64")}`;
}

const fallbackImages = [
  imageDataUri("hero-exterior.jpg"),
  imageDataUri("aerial-view.jpg"),
  imageDataUri("jacuzzi-deck.jpg"),
].filter((value): value is string => Boolean(value));

const palette = {
  ink: "#0B1220",
  navy: "#101C2C",
  navySoft: "#17263B",
  blue: "#1F6FEB",
  sky: "#59B8F8",
  white: "#FFFFFF",
  slate: "#637083",
  pale: "#F5F7FA",
  line: "#D8DEE8",
  green: "#1F9D74",
  amber: "#B7791F",
  red: "#C2413B",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: palette.white,
    color: palette.ink,
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingBottom: 42,
  },
  cover: {
    position: "relative",
    minHeight: "100%",
    backgroundColor: palette.navy,
    color: palette.white,
  },
  coverImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  coverOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(8,18,32,0.64)",
  },
  coverContent: {
    minHeight: "100%",
    paddingHorizontal: 46,
    paddingVertical: 42,
    justifyContent: "space-between",
  },
  coverTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandMark: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2.2,
    color: palette.sky,
  },
  reference: {
    fontSize: 9,
    color: "#D7E0EC",
  },
  coverMiddle: {
    marginTop: 110,
    maxWidth: 470,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: palette.sky,
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 39,
    fontWeight: 700,
    lineHeight: 1.05,
    marginBottom: 14,
  },
  coverSubtitle: {
    fontSize: 15,
    lineHeight: 1.5,
    color: "#EDF3FA",
  },
  coverRule: {
    width: 110,
    height: 3,
    backgroundColor: palette.sky,
    marginVertical: 26,
  },
  preparedLabel: {
    fontSize: 9,
    color: "#B9C6D6",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  preparedName: {
    fontSize: 19,
    fontWeight: 700,
  },
  coverBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  coverDate: {
    fontSize: 10,
    color: "#D1DBE7",
  },
  coverAccent: {
    width: 92,
    height: 5,
    borderRadius: 999,
    backgroundColor: palette.sky,
  },
  header: {
    paddingHorizontal: 42,
    paddingTop: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerBrand: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: palette.blue,
  },
  headerRef: {
    fontSize: 8,
    color: palette.slate,
  },
  content: {
    paddingHorizontal: 42,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 9,
    color: palette.blue,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: palette.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 1.5,
    color: palette.slate,
    maxWidth: 470,
  },
  shortlistGrid: {
    marginTop: 22,
    gap: 14,
  },
  shortlistCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
    minHeight: 126,
  },
  shortlistImage: {
    width: 170,
    minHeight: 126,
    objectFit: "cover",
    backgroundColor: palette.navySoft,
  },
  shortlistBody: {
    flex: 1,
    padding: 15,
  },
  optionLabel: {
    fontSize: 8,
    color: palette.blue,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  shortlistName: {
    fontSize: 18,
    fontWeight: 700,
    color: palette.ink,
  },
  shortlistMeta: {
    marginTop: 5,
    fontSize: 9,
    color: palette.slate,
  },
  shortlistBottom: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  shortlistRate: {
    fontSize: 14,
    fontWeight: 700,
    color: palette.ink,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#E8EEF6",
  },
  statusPositive: {
    backgroundColor: "#E7F7F1",
  },
  statusWarning: {
    backgroundColor: "#FFF6E5",
  },
  statusNegative: {
    backgroundColor: "#FDECEC",
  },
  statusText: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: palette.slate,
  },
  statusTextPositive: {
    color: palette.green,
  },
  statusTextWarning: {
    color: palette.amber,
  },
  statusTextNegative: {
    color: palette.red,
  },
  yachtHero: {
    width: "100%",
    height: 220,
    objectFit: "cover",
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: palette.navySoft,
  },
  yachtNumber: {
    fontSize: 9,
    color: palette.blue,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  yachtTitle: {
    fontSize: 30,
    fontWeight: 700,
    color: palette.ink,
  },
  yachtMeta: {
    marginTop: 6,
    fontSize: 10,
    color: palette.slate,
  },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  specCard: {
    width: "31.5%",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: palette.pale,
  },
  specLabel: {
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: palette.slate,
    marginBottom: 5,
  },
  specValue: {
    fontSize: 12,
    fontWeight: 700,
    color: palette.ink,
  },
  pricingTable: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    overflow: "hidden",
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  pricingFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: palette.navy,
    color: palette.white,
  },
  pricingLabel: {
    color: palette.slate,
    fontSize: 9.5,
  },
  pricingValue: {
    fontSize: 10.5,
    fontWeight: 700,
  },
  pricingFinalLabel: {
    fontSize: 9,
    color: "#C6D0DE",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  pricingFinalValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  noteBox: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 9,
    backgroundColor: palette.pale,
  },
  noteTitle: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 9,
    color: palette.slate,
    lineHeight: 1.5,
  },
  comparisonTable: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    overflow: "hidden",
  },
  comparisonRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  comparisonRowFinal: {
    flexDirection: "row",
  },
  comparisonLabelCell: {
    width: "22%",
    padding: 10,
    backgroundColor: palette.pale,
  },
  comparisonCell: {
    flex: 1,
    padding: 10,
    borderLeftWidth: 1,
    borderLeftColor: palette.line,
  },
  comparisonHead: {
    fontSize: 8,
    color: palette.slate,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  comparisonValue: {
    fontSize: 9,
    fontWeight: 700,
    color: palette.ink,
  },
  termsGrid: {
    flexDirection: "row",
    gap: 16,
    marginTop: 22,
  },
  termsColumn: {
    width: "50%",
  },
  termsHeading: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  bullet: {
    width: 12,
    color: palette.blue,
    fontWeight: 700,
  },
  bulletText: {
    flex: 1,
    color: palette.slate,
    lineHeight: 1.45,
    fontSize: 9,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 42,
    right: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    color: palette.slate,
    fontSize: 8,
  },
});

export function ProposalPdf({
  proposal,
  companyName = "Bahari OS",
}: ProposalPdfProps) {
  const yachts = normalizeYachts(proposal);
  const firstYacht = yachts[0];
  const coverImage =
    getYachtImage(firstYacht, 0) ?? fallbackImages[0] ?? null;

  const startDate = formatDate(proposal.charter.startDate);
  const endDate = formatDate(proposal.charter.endDate);
  const nights = calculateNights(
    proposal.charter.startDate,
    proposal.charter.endDate
  );

  const title =
    yachts.length > 1
      ? `${proposal.reference} - Private Charter Selection`
      : `${proposal.reference} - ${firstYacht?.name ?? "Charter Proposal"}`;

  return (
    <Document
      title={title}
      author={companyName}
      subject="Private yacht charter selection"
      creator={companyName}
    >
      <Page size="A4" style={styles.cover} wrap={false}>
        {coverImage ? (
          <Image src={coverImage} style={styles.coverImage} />
        ) : null}
        <View style={styles.coverOverlay} />
        <View style={styles.coverContent}>
          <View>
            <View style={styles.coverTop}>
              <Text style={styles.brandMark}>
                {companyName.toUpperCase()}
              </Text>
              <Text style={styles.reference}>
                {proposal.reference}
              </Text>
            </View>

            <View style={styles.coverMiddle}>
              <Text style={styles.eyebrow}>
                Private charter selection
              </Text>
              <Text style={styles.coverTitle}>
                {yachts.length > 1
                  ? `${yachts.length} yachts selected for your journey`
                  : firstYacht?.name ?? "Your charter proposal"}
              </Text>
              <Text style={styles.coverSubtitle}>
                A curated collection of yacht options prepared for
                {proposal.charter.destination
                  ? ` ${proposal.charter.destination}`
                  : " your requested charter"}
                .
              </Text>

              <View style={styles.coverRule} />

              <Text style={styles.preparedLabel}>
                Prepared for
              </Text>
              <Text style={styles.preparedName}>
                {proposal.client.name}
              </Text>
            </View>
          </View>

          <View style={styles.coverBottom}>
            <View>
              <Text style={styles.coverDate}>
                {startDate && endDate
                  ? `${startDate} to ${endDate}`
                  : formatDate(proposal.createdAt) ||
                    "Proposal date unavailable"}
              </Text>
              <Text style={[styles.coverDate, { marginTop: 5 }]}>
                Confidential charter document
              </Text>
            </View>
            <View style={styles.coverAccent} />
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.page} wrap={false}>
        <PdfHeader
          companyName={companyName}
          reference={proposal.reference}
        />

        <View style={styles.content}>
          <Text style={styles.sectionLabel}>
            Curated shortlist
          </Text>
          <Text style={styles.title}>
            Your yacht selection
          </Text>
          <Text style={styles.subtitle}>
            Compare the shortlisted yachts below. Rates and availability
            reflect the information recorded in the broker workspace when
            this proposal was generated.
          </Text>

          <View style={styles.shortlistGrid}>
            {yachts.map((yacht, index) => {
              const image = getYachtImage(yacht, index);

              return (
                <View key={`${yacht.position}-${yacht.name}`} style={styles.shortlistCard}>
                  {image ? (
                    <Image src={image} style={styles.shortlistImage} />
                  ) : (
                    <View style={styles.shortlistImage} />
                  )}

                  <View style={styles.shortlistBody}>
                    <Text style={styles.optionLabel}>
                      Option {yacht.position}
                    </Text>
                    <Text style={styles.shortlistName}>
                      {yacht.name}
                    </Text>
                    <Text style={styles.shortlistMeta}>
                      {buildYachtMeta(yacht)}
                    </Text>

                    <View style={styles.shortlistBottom}>
                      <View>
                        <Text style={styles.specLabel}>
                          Weekly charter rate
                        </Text>
                        <Text style={styles.shortlistRate}>
                          {formatCurrency(
                            yacht.weeklyRate,
                            yacht.currency
                          )}
                        </Text>
                      </View>
                      <AvailabilityStatus
                        status={yacht.availabilityStatus}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <PdfFooter
          companyName={companyName}
          reference={proposal.reference}
        />
      </Page>

      {yachts.map((yacht, index) => {
        const image = getYachtImage(yacht, index);

        return (
          <Page
            key={`${yacht.position}-${yacht.id ?? yacht.name}`}
            size="A4"
            style={styles.page}
            wrap={false}
          >
            <PdfHeader
              companyName={companyName}
              reference={proposal.reference}
            />

            <View style={styles.content}>
              <Text style={styles.yachtNumber}>
                Yacht option {String(yacht.position).padStart(2, "0")}
              </Text>
              <Text style={styles.yachtTitle}>
                {yacht.name}
              </Text>
              <Text style={styles.yachtMeta}>
                {buildYachtMeta(yacht)}
              </Text>

              {image ? (
                <Image src={image} style={styles.yachtHero} />
              ) : (
                <View style={styles.yachtHero} />
              )}

              <View style={styles.specGrid}>
                <SpecCard
                  label="Length"
                  value={
                    yacht.lengthMeters !== null
                      ? `${formatNumber(yacht.lengthMeters)} m`
                      : "To be confirmed"
                  }
                />
                <SpecCard
                  label="Guests"
                  value={
                    yacht.sleepingGuests ??
                    yacht.guestCapacity ??
                    proposal.charter.guests ??
                    null
                      ? String(
                          yacht.sleepingGuests ??
                            yacht.guestCapacity ??
                            proposal.charter.guests
                        )
                      : "To be confirmed"
                  }
                />
                <SpecCard
                  label="Cabins"
                  value={
                    yacht.cabinCount !== null
                      ? String(yacht.cabinCount)
                      : "To be confirmed"
                  }
                />
                <SpecCard
                  label="Builder"
                  value={yacht.builder ?? "To be confirmed"}
                />
                <SpecCard
                  label="Home port"
                  value={yacht.homePort ?? "Flexible"}
                />
                <SpecCard
                  label="Availability"
                  value={availabilityLabel(
                    yacht.availabilityStatus
                  )}
                />
              </View>

              <View style={styles.pricingTable}>
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>
                    Weekly charter rate
                  </Text>
                  <Text style={styles.pricingValue}>
                    {formatCurrency(
                      yacht.weeklyRate,
                      yacht.currency
                    )}
                  </Text>
                </View>

                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>
                    Charter period
                  </Text>
                  <Text style={styles.pricingValue}>
                    {startDate && endDate
                      ? `${startDate} to ${endDate}`
                      : "To be confirmed"}
                  </Text>
                </View>

                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>
                    Charter duration
                  </Text>
                  <Text style={styles.pricingValue}>
                    {nights === null
                      ? "To be confirmed"
                      : `${nights} ${
                          nights === 1 ? "night" : "nights"
                        }`}
                  </Text>
                </View>

                <View style={styles.pricingFinal}>
                  <Text style={styles.pricingFinalLabel}>
                    Estimated charter total
                  </Text>
                  <Text style={styles.pricingFinalValue}>
                    {formatCurrency(
                      yacht.estimatedTotal,
                      yacht.currency
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.noteBox}>
                <Text style={styles.noteTitle}>
                  Booking position
                </Text>
                <Text style={styles.noteText}>
                  {availabilityDisclosure(yacht)}
                </Text>
              </View>

              {yacht.brokerNote ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteTitle}>
                    Broker note
                  </Text>
                  <Text style={styles.noteText}>
                    {yacht.brokerNote}
                  </Text>
                </View>
              ) : null}
            </View>

            <PdfFooter
              companyName={companyName}
              reference={proposal.reference}
            />
          </Page>
        );
      })}

      <Page size="A4" style={styles.page} wrap={false}>
        <PdfHeader
          companyName={companyName}
          reference={proposal.reference}
        />

        <View style={styles.content}>
          <Text style={styles.sectionLabel}>
            Side-by-side comparison
          </Text>
          <Text style={styles.title}>
            Compare your options
          </Text>
          <Text style={styles.subtitle}>
            A simple commercial and specification overview of the
            shortlisted yachts.
          </Text>

          <View style={styles.comparisonTable}>
            <ComparisonRow
              label="Yacht"
              values={yachts.map((yacht) => yacht.name)}
              header
            />
            <ComparisonRow
              label="Length"
              values={yachts.map((yacht) =>
                yacht.lengthMeters !== null
                  ? `${formatNumber(yacht.lengthMeters)} m`
                  : "TBC"
              )}
            />
            <ComparisonRow
              label="Guests"
              values={yachts.map((yacht) =>
                String(
                  yacht.sleepingGuests ??
                    yacht.guestCapacity ??
                    proposal.charter.guests ??
                    "TBC"
                )
              )}
            />
            <ComparisonRow
              label="Cabins"
              values={yachts.map((yacht) =>
                yacht.cabinCount !== null
                  ? String(yacht.cabinCount)
                  : "TBC"
              )}
            />
            <ComparisonRow
              label="Weekly rate"
              values={yachts.map((yacht) =>
                formatCurrency(
                  yacht.weeklyRate,
                  yacht.currency
                )
              )}
            />
            <ComparisonRow
              label="Availability"
              values={yachts.map((yacht) =>
                availabilityLabel(
                  yacht.availabilityStatus
                )
              )}
              final
            />
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>
              Broker notes
            </Text>
            <Text style={styles.noteText}>
              {proposal.notes?.trim() ||
                "No additional notes were included with this proposal."}
            </Text>
          </View>

          <View style={styles.termsGrid}>
            <View style={styles.termsColumn}>
              <Text style={styles.termsHeading}>
                Typically included
              </Text>
              <Bullet text="Professional yacht crew and standard onboard service." />
              <Bullet text="Use of the yacht and its standard inventory." />
              <Bullet text="Yacht insurance under the applicable charter agreement." />
              <Bullet text="Standard linen, towels and onboard amenities." />
            </View>

            <View style={styles.termsColumn}>
              <Text style={styles.termsHeading}>
                Typically excluded
              </Text>
              <Bullet text="APA, VAT and local taxes unless expressly stated." />
              <Bullet text="Fuel, marina fees, transfers and shore-side expenses." />
              <Bullet text="Flights, hotels and personal travel arrangements." />
              <Bullet text="Any service not listed in the final charter agreement." />
            </View>
          </View>
        </View>

        <PdfFooter
          companyName={companyName}
          reference={proposal.reference}
        />
      </Page>
    </Document>
  );
}

function normalizeYachts(
  proposal: ProposalPdfData
): ProposalPdfYacht[] {
  if (proposal.yachts.length > 0) {
    return [...proposal.yachts]
      .sort((left, right) => left.position - right.position)
      .slice(0, 3);
  }

  if (!proposal.yacht) {
    return [];
  }

  return [
    {
      id: null,
      position: 1,
      name: proposal.yacht.name,
      weeklyRate:
        proposal.commercial?.weeklyRate ?? null,
      estimatedTotal:
        proposal.commercial?.estimatedTotal ?? null,
      currency:
        proposal.commercial?.currency ?? "EUR",
      availabilityStatus: "unverified",
      verificationStatus: "not_checked",
      accessType: null,
      bookingModel: null,
      brokerNote: null,
      heroImageUrl: null,
      yachtType: null,
      builder: null,
      model: null,
      buildYear: null,
      lengthMeters: null,
      guestCapacity: null,
      sleepingGuests: null,
      cabinCount: null,
      homePort: null,
      cruisingRegions: [],
    },
  ];
}

function getYachtImage(
  yacht: ProposalPdfYacht | undefined,
  index: number
): string | null {
  const candidate = yacht?.heroImageUrl?.trim();

  if (
    candidate &&
    (/^https?:\/\//i.test(candidate) ||
      /^data:image\//i.test(candidate))
  ) {
    return candidate;
  }

  return (
    fallbackImages[index % Math.max(fallbackImages.length, 1)] ??
    fallbackImages[0] ??
    null
  );
}

function buildYachtMeta(
  yacht: ProposalPdfYacht
): string {
  return [
    yacht.yachtType,
    yacht.lengthMeters !== null
      ? `${formatNumber(yacht.lengthMeters)} m`
      : null,
    yacht.builder,
    yacht.buildYear !== null
      ? String(yacht.buildYear)
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Luxury charter yacht";
}

function availabilityLabel(
  status: string | null
): string {
  const normalized =
    status?.trim().toLowerCase() ?? "";

  const labels: Record<string, string> = {
    available: "Available",
    subject_to_confirmation: "Subject to confirmation",
    owner_approval_required: "Owner approval required",
    unverified: "Subject to verification",
    unavailable: "Unavailable",
    provisional: "Provisional",
    option: "Option",
    booked: "Booked",
  };

  return labels[normalized] ?? "Subject to verification";
}

function availabilityDisclosure(
  yacht: ProposalPdfYacht
): string {
  const status =
    yacht.availabilityStatus?.trim().toLowerCase();

  if (status === "available" && yacht.accessType === "controlled") {
    return "The yacht is shown as available in the controlled fleet calendar for the requested charter period.";
  }

  if (
    status === "owner_approval_required" ||
    yacht.bookingModel === "owner_approval_required" ||
    yacht.accessType === "managed"
  ) {
    return "Availability is presented subject to owner or Charter Manager approval. Final acceptance is not guaranteed until confirmed.";
  }

  if (
    status === "subject_to_confirmation" ||
    yacht.accessType === "broker_access"
  ) {
    return "Availability is subject to fresh Charter Manager confirmation before contract.";
  }

  if (status === "unavailable") {
    return "This yacht is currently recorded as unavailable for the requested dates.";
  }

  return "Availability remains subject to verification and final charter acceptance.";
}

function AvailabilityStatus({
  status,
}: {
  status: string | null;
}) {
  const normalized =
    status?.trim().toLowerCase() ?? "";

  const positive = normalized === "available";
  const negative =
    normalized === "unavailable" ||
    normalized === "booked";
  const warning =
    normalized === "owner_approval_required" ||
    normalized === "subject_to_confirmation" ||
    normalized === "option" ||
    normalized === "provisional";

  return (
    <View
      style={[
        styles.statusPill,
        positive
          ? styles.statusPositive
          : negative
            ? styles.statusNegative
            : warning
              ? styles.statusWarning
              : {},
      ]}
    >
      <Text
        style={[
          styles.statusText,
          positive
            ? styles.statusTextPositive
            : negative
              ? styles.statusTextNegative
              : warning
                ? styles.statusTextWarning
                : {},
        ]}
      >
        {availabilityLabel(status)}
      </Text>
    </View>
  );
}

function ComparisonRow({
  label,
  values,
  header = false,
  final = false,
}: {
  label: string;
  values: string[];
  header?: boolean;
  final?: boolean;
}) {
  return (
    <View
      style={
        final
          ? styles.comparisonRowFinal
          : styles.comparisonRow
      }
    >
      <View style={styles.comparisonLabelCell}>
        <Text style={styles.comparisonHead}>
          {label}
        </Text>
      </View>

      {values.map((value, index) => (
        <View
          key={`${label}-${index}`}
          style={styles.comparisonCell}
        >
          <Text
            style={
              header
                ? styles.comparisonHead
                : styles.comparisonValue
            }
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SpecCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.specCard}>
      <Text style={styles.specLabel}>
        {label}
      </Text>
      <Text style={styles.specValue}>
        {value}
      </Text>
    </View>
  );
}

function PdfHeader({
  companyName,
  reference,
}: {
  companyName: string;
  reference: string;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerBrand}>
        {companyName.toUpperCase()}
      </Text>
      <Text style={styles.headerRef}>
        {reference}
      </Text>
    </View>
  );
}

function PdfFooter({
  companyName,
  reference,
}: {
  companyName: string;
  reference: string;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>{companyName}</Text>
      <Text>{reference}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function Bullet({
  text,
}: {
  text: string;
}) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.bulletText}>
        {text}
      </Text>
    </View>
  );
}

function formatCurrency(
  value: number | null,
  currency: string
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency || "EUR"} ${value.toLocaleString("en-GB")}`;
  }
}

function formatDate(
  value: string | null
): string {
  if (!value) {
    return "";
  }

  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function calculateNights(
  startDate: string | null,
  endDate: string | null
): number | null {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(
    `${startDate.slice(0, 10)}T00:00:00Z`
  );
  const end = new Date(
    `${endDate.slice(0, 10)}T00:00:00Z`
  );

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return null;
  }

  return Math.round(
    (end.getTime() - start.getTime()) / 86_400_000
  );
}

function formatNumber(
  value: number
): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1);
}