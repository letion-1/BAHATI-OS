import "server-only";

/**
 * Reference documents are not availability sources.
 *
 * A market reference sheet lists yachts a brokerage does not represent, with
 * rates and dates that are indicative rather than held. SOURCE-D is the case
 * this was written for. It says so itself, in its own subtitle and again in
 * its closing line: a reference listing, not a booking source, not a live
 * source, not an offer.
 *
 * Refusing these is the point, not a limitation to work around later.
 *
 * The prose is soft in a way a calendar never is. "Understood to be open for
 * parts of late June", "believed to be committed", "should be confirmed with
 * the central agent before anything is put in front of a client". Extraction
 * cannot preserve that hedging. It would produce a June window on a yacht
 * represented by another house, rendered on the availability timeline in the
 * same green as a held week from the managed fleet, and a broker would quote
 * it. The document explicitly asks not to be used that way.
 *
 * So this is checked before AI extraction is offered, because AI extraction
 * is precisely what would succeed here and precisely what must not run. A
 * capable extractor reading a document that asks not to be extracted is worse
 * than a parser that declines.
 */

/**
 * Phrases that only appear when a document is disclaiming itself. Each is a
 * full phrase rather than a keyword: "reference" alone matches a reference
 * number, and "indicative" alone matches a fair number of honest rate cards.
 */
const DISCLAIMER_PHRASES = [
  "not a booking source",
  "not a bookable calendar",
  "does not constitute an offer",
  "should not be treated as a live source",
  "not a live source",
  "reference listing",
  "reference only",
  "for market reference",
  "market reference only",
  "indicative only",
  "subject to confirmation with the central agent",
  "represented centrally by another",
  "central agent",
  "no obligation",
  "for information only",
];

/**
 * Two independent disclaimers, not one.
 *
 * A single stray phrase appears in the footer of plenty of genuine
 * availability sheets, and refusing one of those would be the worse error:
 * the broker loses real availability and has no way to override it. A
 * document that disclaims itself twice is stating an intent.
 */
const MIN_MATCHES = 2;

export type ReferenceDocumentCheck = {
  isReferenceDocument: boolean;
  /** The phrases found, for the message shown to the broker. */
  matchedPhrases: string[];
};

export function detectReferenceDocument(
  plainText: string
): ReferenceDocumentCheck {
  const normalized = plainText
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");

  const matchedPhrases = DISCLAIMER_PHRASES.filter((phrase) =>
    normalized.includes(phrase)
  );

  return {
    isReferenceDocument: matchedPhrases.length >= MIN_MATCHES,
    matchedPhrases,
  };
}

/**
 * Written for the broker, not the log. It names what the file says about
 * itself, because the refusal only makes sense if they can see the document
 * asked for it.
 */
export function referenceDocumentMessage(
  check: ReferenceDocumentCheck
): string {
  const quoted = check.matchedPhrases
    .slice(0, 2)
    .map((phrase) => `"${phrase}"`)
    .join(" and ");

  return (
    `This file describes itself as ${quoted}, so it is a market reference ` +
    "rather than a calendar you can sell from. Importing it would put yachts " +
    "you do not represent on your availability timeline, with dates the " +
    "document says to confirm with the central agent first. Keep it as a " +
    "reference and add availability from the managing broker's own source."
  );
}