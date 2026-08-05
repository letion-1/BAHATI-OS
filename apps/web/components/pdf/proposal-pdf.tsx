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

export type ProposalPdfData = {
  reference: string;
  createdAt: string | null;
  client: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  yacht: {
    name: string;
  };
  charter: {
    startDate: string | null;
    endDate: string | null;
    guests: number | null;
  };
  commercial: {
    weeklyRate: number | null;
    estimatedTotal: number | null;
    currency: string;
  };
  notes: string | null;
};

type ProposalPdfProps = {
  proposal: ProposalPdfData;
  companyName?: string;
};

function imageDataUri(fileName: string): string {
  const absolutePath = path.join(
    process.cwd(),
    "public",
    "proposal-yacht",
    fileName
  );

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Proposal image is missing: ${absolutePath}. Run the image compression script first.`
    );
  }

  const file = fs.readFileSync(absolutePath);
  return `data:image/jpeg;base64,${file.toString("base64")}`;
}

const images = {
  hero: imageDataUri("hero-exterior.jpg"),
  salon: imageDataUri("salon.jpg"),
  cabin: imageDataUri("master-cabin.jpg"),
  beach: imageDataUri("beach-club.jpg"),
  aerial: imageDataUri("aerial-view.jpg"),
  jacuzzi: imageDataUri("jacuzzi-deck.jpg"),
};

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
    backgroundColor: "rgba(8,18,32,0.58)",
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
    marginTop: 90,
    maxWidth: 450,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: palette.sky,
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1.05,
    marginBottom: 14,
  },
  coverSubtitle: {
    fontSize: 16,
    lineHeight: 1.45,
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
    maxWidth: 430,
  },
  wideImage: {
    width: "100%",
    height: 150,
    objectFit: "cover",
    borderRadius: 10,
    marginTop: 16,
  },

  statusPill: {
    alignSelf: "flex-start",
    marginTop: 16,
    backgroundColor: "#E7F7F1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    color: palette.green,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    gap: 10,
  },
  summaryCard: {
    width: "48.5%",
    backgroundColor: palette.pale,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    padding: 15,
  },
  summaryLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: palette.slate,
    marginBottom: 7,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: 700,
    color: palette.ink,
  },
  timeline: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    padding: 18,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineDate: {
    width: 120,
  },
  timelineDateLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: palette.slate,
    marginBottom: 5,
  },
  timelineDateValue: {
    fontSize: 14,
    fontWeight: 700,
  },
  timelineLine: {
    flexGrow: 1,
    height: 2,
    backgroundColor: palette.sky,
    marginHorizontal: 14,
  },
  nightsBox: {
    marginTop: 18,
    backgroundColor: palette.navy,
    color: palette.white,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nightsLabel: {
    color: "#B7C3D3",
    fontSize: 9,
  },
  nightsValue: {
    fontSize: 13,
    fontWeight: 700,
  },

  galleryLead: {
    width: "100%",
    height: 195,
    objectFit: "cover",
    borderRadius: 10,
    marginTop: 16,
  },
  galleryRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  galleryCard: {
    width: "50%",
  },
  galleryImage: {
    width: "100%",
    height: 120,
    objectFit: "cover",
    borderRadius: 8,
  },
  galleryCaption: {
    marginTop: 7,
    fontSize: 9,
    color: palette.slate,
  },

  featurePage: {
    backgroundColor: palette.navy,
    color: palette.white,
    minHeight: "100%",
    paddingBottom: 42,
  },
  featureHeader: {
    paddingHorizontal: 42,
    paddingTop: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#31435C",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featureHeaderBrand: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: palette.sky,
  },
  featureHeaderRef: {
    fontSize: 8,
    color: "#AAB6C7",
  },
  featureContent: {
    paddingHorizontal: 42,
    paddingTop: 24,
  },
  featureLabel: {
    fontSize: 9,
    color: palette.sky,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 27,
    fontWeight: 700,
    marginBottom: 8,
  },
  featureSubtitle: {
    fontSize: 11,
    lineHeight: 1.5,
    color: "#C8D3E1",
    maxWidth: 430,
  },
  featureHero: {
    width: "100%",
    height: 185,
    objectFit: "cover",
    borderRadius: 10,
    marginTop: 16,
  },
  featureGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  featureCard: {
    width: "50%",
    backgroundColor: palette.navySoft,
    borderRadius: 9,
    overflow: "hidden",
  },
  featureImage: {
    width: "100%",
    height: 105,
    objectFit: "cover",
  },
  featureTextBox: {
    padding: 12,
  },
  featureCardTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
  },
  featureCardText: {
    fontSize: 8.5,
    lineHeight: 1.45,
    color: "#C8D3E1",
  },

  pricingTable: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    overflow: "hidden",
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  pricingRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: palette.navy,
    color: palette.white,
  },
  pricingLabel: {
    color: palette.slate,
    fontSize: 10,
  },
  pricingValue: {
    fontSize: 11,
    fontWeight: 700,
  },
  pricingFinalLabel: {
    fontSize: 10,
    color: "#C6D0DE",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  pricingFinalValue: {
    fontSize: 16,
    fontWeight: 700,
  },
  notesBox: {
    marginTop: 24,
    padding: 18,
    backgroundColor: palette.pale,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 9,
  },
  notesText: {
    color: palette.slate,
    lineHeight: 1.55,
  },
  termsGrid: {
    flexDirection: "row",
    gap: 16,
    marginTop: 24,
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
  },
  signature: {
    marginTop: 30,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBlock: {
    width: "47%",
  },
  signatureLine: {
    height: 1,
    backgroundColor: palette.line,
    marginTop: 28,
    marginBottom: 7,
  },
  signatureLabel: {
    color: palette.slate,
    fontSize: 8,
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
  darkFooter: {
    position: "absolute",
    bottom: 18,
    left: 42,
    right: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#9FB0C4",
    fontSize: 8,
  },
});

export function ProposalPdf({
  proposal,
  companyName = "Intrigue Yacht OS",
}: ProposalPdfProps) {
  const startDate = formatDate(proposal.charter.startDate);
  const endDate = formatDate(proposal.charter.endDate);
  const nights = calculateNights(
    proposal.charter.startDate,
    proposal.charter.endDate
  );
  const weeklyRate = formatCurrency(
    proposal.commercial.weeklyRate,
    proposal.commercial.currency
  );
  const estimatedTotal = formatCurrency(
    proposal.commercial.estimatedTotal,
    proposal.commercial.currency
  );

  return (
    <Document
      title={`${proposal.reference} - ${proposal.yacht.name}`}
      author={companyName}
      subject="Luxury yacht charter proposal"
      creator={companyName}
    >
      <Page size="A4" style={styles.cover} wrap={false}>
        <Image src={images.hero} style={styles.coverImage} />
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
                Luxury charter proposal
              </Text>
              <Text style={styles.coverTitle}>
                {proposal.yacht.name}
              </Text>
              <Text style={styles.coverSubtitle}>
                A private charter experience prepared exclusively
                for your journey.
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
                {formatDate(proposal.createdAt) ||
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
          <Text style={styles.sectionLabel}>Charter overview</Text>
          <Text style={styles.title}>{proposal.yacht.name}</Text>
          <Text style={styles.subtitle}>
            A concise overview of the selected yacht, charter period
            and guest requirements.
          </Text>

          <Image src={images.aerial} style={styles.wideImage} />

          <View style={styles.statusPill}>
            <Text style={styles.statusText}>
              Prepared proposal
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryCard
              label="Client"
              value={proposal.client.name}
            />
            <SummaryCard
              label="Guests"
              value={
                proposal.charter.guests
                  ? String(proposal.charter.guests)
                  : "To be confirmed"
              }
            />
            <SummaryCard
              label="Weekly rate"
              value={weeklyRate}
            />
            <SummaryCard
              label="Estimated total"
              value={estimatedTotal}
            />
          </View>

          <View style={styles.timeline}>
            <View style={styles.timelineRow}>
              <View style={styles.timelineDate}>
                <Text style={styles.timelineDateLabel}>
                  Embarkation
                </Text>
                <Text style={styles.timelineDateValue}>
                  {startDate || "To be confirmed"}
                </Text>
              </View>

              <View style={styles.timelineLine} />

              <View style={styles.timelineDate}>
                <Text style={styles.timelineDateLabel}>
                  Disembarkation
                </Text>
                <Text style={styles.timelineDateValue}>
                  {endDate || "To be confirmed"}
                </Text>
              </View>
            </View>

            <View style={styles.nightsBox}>
              <Text style={styles.nightsLabel}>
                Charter duration
              </Text>
              <Text style={styles.nightsValue}>
                {nights === null
                  ? "To be confirmed"
                  : `${nights} ${
                      nights === 1 ? "night" : "nights"
                    }`}
              </Text>
            </View>
          </View>
        </View>

        <PdfFooter
          companyName={companyName}
          reference={proposal.reference}
        />
      </Page>

      <Page size="A4" style={styles.page} wrap={false}>
        <PdfHeader
          companyName={companyName}
          reference={proposal.reference}
        />

        <View style={styles.content}>
          <Text style={styles.sectionLabel}>Onboard spaces</Text>
          <Text style={styles.title}>Interior gallery</Text>
          <Text style={styles.subtitle}>
            Refined living spaces designed for privacy, comfort and
            effortless time at sea.
          </Text>

          <Image src={images.salon} style={styles.galleryLead} />

          <View style={styles.galleryRow}>
            <View style={styles.galleryCard}>
              <Image
                src={images.cabin}
                style={styles.galleryImage}
              />
              <Text style={styles.galleryCaption}>
                Master suite with panoramic sea views
              </Text>
            </View>

            <View style={styles.galleryCard}>
              <Image
                src={images.hero}
                style={styles.galleryImage}
              />
              <Text style={styles.galleryCaption}>
                Contemporary exterior profile
              </Text>
            </View>
          </View>
        </View>

        <PdfFooter
          companyName={companyName}
          reference={proposal.reference}
        />
      </Page>

      <Page size="A4" style={styles.featurePage} wrap={false}>
        <DarkPdfHeader
          companyName={companyName}
          reference={proposal.reference}
        />

        <View style={styles.featureContent}>
          <Text style={styles.featureLabel}>
            The yacht experience
          </Text>
          <Text style={styles.featureTitle}>
            Life beyond the shoreline
          </Text>
          <Text style={styles.featureSubtitle}>
            Open-air relaxation, direct access to the sea and
            carefully designed spaces for every moment of the
            charter.
          </Text>

          <Image
            src={images.jacuzzi}
            style={styles.featureHero}
          />

          <View style={styles.featureGrid}>
            <View style={styles.featureCard}>
              <Image
                src={images.beach}
                style={styles.featureImage}
              />
              <View style={styles.featureTextBox}>
                <Text style={styles.featureCardTitle}>
                  Beach club
                </Text>
                <Text style={styles.featureCardText}>
                  A private waterside lounge with effortless access
                  to swimming, tenders and water activities.
                </Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <Image
                src={images.aerial}
                style={styles.featureImage}
              />
              <View style={styles.featureTextBox}>
                <Text style={styles.featureCardTitle}>
                  Expansive deck living
                </Text>
                <Text style={styles.featureCardText}>
                  Multiple outdoor areas designed for sun, dining,
                  conversation and uninterrupted coastal views.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <DarkPdfFooter
          companyName={companyName}
          reference={proposal.reference}
        />
      </Page>

      <Page size="A4" style={styles.page} wrap={false}>
        <PdfHeader
          companyName={companyName}
          reference={proposal.reference}
        />

        <View style={styles.content}>
          <Text style={styles.sectionLabel}>
            Commercial summary
          </Text>
          <Text style={styles.title}>Charter investment</Text>
          <Text style={styles.subtitle}>
            The values below reflect the proposal information
            currently stored in the broker workspace.
          </Text>

          <View style={styles.pricingTable}>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>
                Weekly charter rate
              </Text>
              <Text style={styles.pricingValue}>
                {weeklyRate}
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

            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Currency</Text>
              <Text style={styles.pricingValue}>
                {proposal.commercial.currency || "EUR"}
              </Text>
            </View>

            <View style={styles.pricingRowFinal}>
              <Text style={styles.pricingFinalLabel}>
                Estimated charter total
              </Text>
              <Text style={styles.pricingFinalValue}>
                {estimatedTotal}
              </Text>
            </View>
          </View>

          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>Broker notes</Text>
            <Text style={styles.notesText}>
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

          <View style={styles.signature}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLabel}>
                Prepared by
              </Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>
                {companyName}
              </Text>
            </View>

            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLabel}>
                Client acknowledgement
              </Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>
                {proposal.client.name}
              </Text>
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
      <Text style={styles.headerRef}>{reference}</Text>
    </View>
  );
}

function DarkPdfHeader({
  companyName,
  reference,
}: {
  companyName: string;
  reference: string;
}) {
  return (
    <View style={styles.featureHeader}>
      <Text style={styles.featureHeaderBrand}>
        {companyName.toUpperCase()}
      </Text>
      <Text style={styles.featureHeaderRef}>{reference}</Text>
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

function DarkPdfFooter({
  companyName,
  reference,
}: {
  companyName: string;
  reference: string;
}) {
  return (
    <View style={styles.darkFooter} fixed>
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

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function formatCurrency(
  value: number | null,
  currency: string
): string {
  if (value === null || !Number.isFinite(value)) {
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

function formatDate(value: string | null): string {
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