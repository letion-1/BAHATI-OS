import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export type CharterAgreementPayment = {
  paymentType: string;
  label: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  status: string;
  amountPaid: number;
};

export type CharterAgreementData = {
  reference: string;
  version: number;
  generatedAt: string;

  companyName: string;

  client: {
    name: string;
    email: string | null;
    phone: string | null;
  };

  yacht: {
    name: string;
    heroImageUrl: string | null;
    heroImageIsPlaceholder: boolean;
  };

  charter: {
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    embarkationPort: string | null;
    disembarkationPort: string | null;
    guests: number | null;
  };

  commercial: {
    currency: string;
    charterFee: number | null;
    vatPercent: number | null;
    vatAmount: number | null;
    apaPercent: number | null;
    apaAmount: number | null;
    depositPercent: number | null;
    depositAmount: number | null;
    balanceAmount: number | null;
    totalContractValue: number | null;
  };

  payments: CharterAgreementPayment[];
};

const palette = {
  ink: "#10151D",
  navy: "#0B1522",
  slate: "#5D6877",
  line: "#D7DDE5",
  pale: "#F5F7FA",
  blue: "#1E6FE8",
  white: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 50,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: palette.ink,
    backgroundColor: palette.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  brand: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: palette.navy,
  },
  ref: {
    fontSize: 8,
    color: palette.slate,
  },
  eyebrow: {
    marginTop: 26,
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: palette.blue,
  },
  title: {
    marginTop: 7,
    fontSize: 25,
    fontWeight: 700,
    color: palette.navy,
  },
  subtitle: {
    marginTop: 8,
    color: palette.slate,
    lineHeight: 1.5,
  },
  yachtHero: {
    width: "100%",
    height: 210,
    objectFit: "cover",
    marginTop: 18,
    borderRadius: 9,
    backgroundColor: palette.pale,
  },
  yachtHeroCaption: {
    marginTop: 7,
    fontSize: 8,
    color: palette.slate,
  },
  notice: {
    marginTop: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F2C46D",
    borderRadius: 8,
    backgroundColor: "#FFF9EC",
  },
  noticeTitle: {
    fontSize: 8.5,
    fontWeight: 700,
    color: "#714F00",
    marginBottom: 5,
  },
  noticeText: {
    color: "#714F00",
    fontSize: 8.5,
    lineHeight: 1.45,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: palette.navy,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    width: "48.5%",
    padding: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 7,
    backgroundColor: palette.pale,
  },
  label: {
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: palette.slate,
    marginBottom: 4,
  },
  value: {
    fontSize: 9.5,
    fontWeight: 700,
    color: palette.ink,
  },
  table: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  tableRowFinal: {
    flexDirection: "row",
  },
  tableLabel: {
    width: "48%",
    padding: 9,
    color: palette.slate,
    backgroundColor: palette.pale,
  },
  tableValue: {
    width: "52%",
    padding: 9,
    fontWeight: 700,
    textAlign: "right",
  },
  paymentHeader: {
    flexDirection: "row",
    backgroundColor: palette.navy,
    color: palette.white,
  },
  paymentRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  paymentCellType: {
    width: "30%",
    padding: 8,
  },
  paymentCellDate: {
    width: "22%",
    padding: 8,
  },
  paymentCellAmount: {
    width: "24%",
    padding: 8,
    textAlign: "right",
  },
  paymentCellStatus: {
    width: "24%",
    padding: 8,
    textAlign: "right",
  },
  signatures: {
    flexDirection: "row",
    gap: 28,
    marginTop: 34,
  },
  signature: {
    width: "50%",
  },
  signatureLine: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: palette.ink,
    paddingTop: 6,
    fontSize: 8,
    color: palette.slate,
  },
  footer: {
    position: "absolute",
    left: 42,
    right: 42,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: palette.slate,
  },
});

export function CharterAgreementPdf({
  agreement,
}: {
  agreement: CharterAgreementData;
}) {
  const c = agreement.commercial;

  return (
    <Document
      title={`${agreement.reference} - Charter Agreement Draft v${agreement.version}`}
      author={agreement.companyName}
      subject="Private yacht charter agreement draft"
      creator={agreement.companyName}
    >
      <Page size="A4" style={styles.page}>
        <Header agreement={agreement} />

        <Text style={styles.eyebrow}>
          Private yacht charter
        </Text>
        <Text style={styles.title}>
          Charter Agreement Draft
        </Text>
        <Text style={styles.subtitle}>
          Commercial and itinerary terms compiled from the confirmed charter workspace.
        </Text>

        {isUsableImageUrl(
          agreement.yacht.heroImageUrl
        ) ? (
          <>
            <Image
              src={agreement.yacht.heroImageUrl!}
              style={styles.yachtHero}
            />
            <Text style={styles.yachtHeroCaption}>
              {agreement.yacht.heroImageIsPlaceholder
                ? "Presentation image · Actual yacht imagery not yet uploaded"
                : `${agreement.yacht.name} · Selected charter yacht`}
            </Text>
          </>
        ) : null}

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            Draft status
          </Text>
          <Text style={styles.noticeText}>
            This generated document records the operational and commercial information currently stored in Yacht OS. It does not add legal clauses, cancellation provisions, governing-law terms, special conditions, or other terms that are not recorded in the workspace. The definitive charter agreement should be reviewed and completed using the contract form approved by the parties before signature.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Parties and charter
          </Text>

          <View style={styles.grid}>
            <InfoCard
              label="Charterer"
              value={agreement.client.name}
            />
            <InfoCard
              label="Yacht"
              value={agreement.yacht.name}
            />
            <InfoCard
              label="Charter period"
              value={formatDateRange(
                agreement.charter.startDate,
                agreement.charter.endDate
              )}
            />
            <InfoCard
              label="Guests"
              value={
                agreement.charter.guests !== null
                  ? String(agreement.charter.guests)
                  : "Not specified"
              }
            />
            <InfoCard
              label="Destination"
              value={
                agreement.charter.destination ??
                "Not specified"
              }
            />
            <InfoCard
              label="Embarkation"
              value={
                agreement.charter.embarkationPort ??
                "Not specified"
              }
            />
            <InfoCard
              label="Disembarkation"
              value={
                agreement.charter.disembarkationPort ??
                "Not specified"
              }
            />
            <InfoCard
              label="Client contact"
              value={
                agreement.client.email ??
                agreement.client.phone ??
                "Not specified"
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Commercial terms
          </Text>

          <View style={styles.table}>
            <MoneyRow
              label="Charter fee"
              value={formatMoney(
                c.charterFee,
                c.currency
              )}
            />
            <MoneyRow
              label={
                c.vatPercent !== null
                  ? `VAT (${formatPercent(c.vatPercent)})`
                  : "VAT"
              }
              value={formatMoney(
                c.vatAmount,
                c.currency
              )}
            />
            <MoneyRow
              label={
                c.apaPercent !== null
                  ? `APA (${formatPercent(c.apaPercent)})`
                  : "APA"
              }
              value={formatMoney(
                c.apaAmount,
                c.currency
              )}
            />
            <MoneyRow
              label={
                c.depositPercent !== null
                  ? `Deposit (${formatPercent(c.depositPercent)})`
                  : "Deposit"
              }
              value={formatMoney(
                c.depositAmount,
                c.currency
              )}
            />
            <MoneyRow
              label="Balance"
              value={formatMoney(
                c.balanceAmount,
                c.currency
              )}
            />
            <MoneyRow
              label="Total contract value"
              value={formatMoney(
                c.totalContractValue,
                c.currency
              )}
              final
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Payment schedule
          </Text>

          {agreement.payments.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.paymentHeader}>
                <Text style={styles.paymentCellType}>
                  Milestone
                </Text>
                <Text style={styles.paymentCellDate}>
                  Due
                </Text>
                <Text style={styles.paymentCellAmount}>
                  Amount
                </Text>
                <Text style={styles.paymentCellStatus}>
                  Status
                </Text>
              </View>

              {agreement.payments.map(
                (payment) => (
                  <View
                    key={`${payment.paymentType}-${payment.label}-${payment.dueDate}`}
                    style={styles.paymentRow}
                  >
                    <Text style={styles.paymentCellType}>
                      {payment.label ??
                        formatLabel(
                          payment.paymentType
                        )}
                    </Text>
                    <Text style={styles.paymentCellDate}>
                      {formatDate(
                        payment.dueDate
                      )}
                    </Text>
                    <Text style={styles.paymentCellAmount}>
                      {formatMoney(
                        payment.amount,
                        payment.currency
                      )}
                    </Text>
                    <Text style={styles.paymentCellStatus}>
                      {formatLabel(
                        payment.status
                      )}
                    </Text>
                  </View>
                )
              )}
            </View>
          ) : (
            <Text style={styles.subtitle}>
              No payment milestones were recorded when this draft was generated.
            </Text>
          )}
        </View>

        <View style={styles.signatures}>
          <View style={styles.signature}>
            <Text>
              For {agreement.companyName}
            </Text>
            <Text style={styles.signatureLine}>
              Authorized signatory / Date
            </Text>
          </View>

          <View style={styles.signature}>
            <Text>
              Charterer: {agreement.client.name}
            </Text>
            <Text style={styles.signatureLine}>
              Signature / Date
            </Text>
          </View>
        </View>

        <Footer agreement={agreement} />
      </Page>
    </Document>
  );
}

function Header({
  agreement,
}: {
  agreement: CharterAgreementData;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>
        {agreement.companyName.toUpperCase()}
      </Text>
      <Text style={styles.ref}>
        {agreement.reference} · v{agreement.version}
      </Text>
    </View>
  );
}

function Footer({
  agreement,
}: {
  agreement: CharterAgreementData;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>{agreement.reference}</Text>
      <Text>
        Generated {formatDateTime(agreement.generatedAt)}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>
        {label}
      </Text>
      <Text style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

function MoneyRow({
  label,
  value,
  final = false,
}: {
  label: string;
  value: string;
  final?: boolean;
}) {
  return (
    <View
      style={
        final
          ? styles.tableRowFinal
          : styles.tableRow
      }
    >
      <Text style={styles.tableLabel}>
        {label}
      </Text>
      <Text style={styles.tableValue}>
        {value}
      </Text>
    </View>
  );
}

function formatMoney(
  value: number | null,
  currency: string
) {
  if (value === null) {
    return "Not specified";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatPercent(
  value: number
) {
  return `${value}%`;
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "Not specified";
  }

  return `${formatDate(start)} to ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Not specified";
  }

  const date = new Date(
    `${value.slice(0, 10)}T12:00:00Z`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(
  value: string
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatLabel(
  value: string
) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}


function isUsableImageUrl(
  value: string | null
) {
  if (!value) {
    return false;
  }

  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value)
  );
}