import "server-only";

/**
 * German retention periods, in one place so they can be corrected in one
 * place.
 *
 * NOT LEGAL ADVICE. These are read from the published statutes and from IHK
 * and tax-advisory summaries. They have not been reviewed by counsel retained
 * for this product. The classification questions are the risky part, not the
 * numbers: whether a signed charter agreement counts as a Buchungsbeleg
 * (eight years) or a Handelsbrief (six) is a judgement this file cannot make.
 *
 * Where the answer is unclear the longer period is used. Over-retaining a
 * commercial document is a GDPR minimisation problem; under-retaining one is
 * a tax offence, and only one of those two comes with §379 AO attached.
 *
 * SOURCES
 *
 *   §147 AO      https://www.gesetze-im-internet.de/ao_1977/__147.html
 *   §257 HGB     https://www.gesetze-im-internet.de/hgb/__257.html
 *   §169 AO      https://www.gesetze-im-internet.de/ao_1977/__169.html
 *   Art. 17 GDPR https://gdpr-info.eu/art-17-gdpr/
 *   Art. 18 GDPR https://gdpr-info.eu/art-18-gdpr/
 *   Art. 28 GDPR https://gdpr-info.eu/art-28-gdpr/
 *   IHK Köln overview of the periods:
 *   https://www.ihk.de/koeln/hauptnavigation/recht-steuern/steuern/aufbewahrung-von-geschaeftsunterlagen-5905058
 */

/**
 * Ten years: books, records, inventories, annual accounts, opening balance.
 * §147(1) Nr. 1 and 4a AO, §257(1) Nr. 1 HGB, §147(3) Satz 1 AO.
 */
export const RETENTION_YEARS_ACCOUNTS = 10;

/**
 * Eight years: Buchungsbelege and invoices. §147(1) Nr. 4 AO, §257(4) HGB.
 *
 * This was ten years until the Viertes Bürokratieentlastungsgesetz shortened
 * it with effect from 1 January 2025, for any document whose old period had
 * not already expired on 31 December 2024. Code written before that date
 * against the ten-year rule is now over-retaining.
 */
export const RETENTION_YEARS_ACCOUNTING_RECORDS = 8;

/**
 * Six years: commercial and business letters, including email.
 * §147(1) Nr. 2 and 3 AO, §257(1) Nr. 2 and 3 HGB.
 */
export const RETENTION_YEARS_CORRESPONDENCE = 6;

/**
 * Grace period before the cascade runs, in days.
 *
 * Art. 12(3) allows one month to respond to a request, so this costs nothing
 * legally and buys back the mistaken click. Art. 9 data and live share tokens
 * do not wait for it.
 */
export const DELETION_GRACE_DAYS = 30;

/**
 * When a retention period ends.
 *
 * §147(4) AO is specific and easy to get wrong: the period starts at the END
 * of the calendar year in which the document arose, not on the document's own
 * date. An invoice from March 2026 therefore runs from 31 December 2026, and
 * an eight-year period on it expires on 31 December 2034 rather than in March.
 *
 * Getting this wrong shortens every period by up to a year, which is the
 * direction that carries a penalty.
 */
export function retentionUntil(
  documentDate: Date,
  years: number
): Date {
  const yearEnd = Date.UTC(documentDate.getUTCFullYear(), 11, 31);

  const expiry = new Date(yearEnd);

  expiry.setUTCFullYear(expiry.getUTCFullYear() + years);

  return expiry;
}

/**
 * True when a record is past its retention period and may be hard-deleted.
 *
 * §147(3) Satz 5 AO is the reason this reads a stored date rather than
 * recomputing one: the period does not end while the documents still matter
 * for a tax whose §169 AO assessment period is open. An audit in progress
 * extends it, sometimes past ten years. Nothing in the data model can detect
 * that, so `retention_until` is a column a human can push out, and a null
 * value means "not yet classified" and is treated as still retained.
 */
export function isRetentionExpired(
  retentionUntilValue: string | null,
  now: Date = new Date()
): boolean {
  if (!retentionUntilValue) {
    return false;
  }

  return new Date(retentionUntilValue).getTime() <= now.getTime();
}