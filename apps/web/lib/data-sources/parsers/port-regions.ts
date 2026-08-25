/**
 * Resolve a port or place name to the charter region it sits in.
 *
 * Availability sheets name ports, not regions: "Split", "Mykonos", "Porto
 * Cervo". The dashboard map looks its markers up in REGION_COORDINATES, which
 * is keyed by region ("croatia", "greece", "sardinia"), so a port never
 * matches and never draws a marker even once location is imported.
 *
 * The importer already reads `region` from availability metadata and the
 * dashboard prefers it over `location`, with a comment noting region is "the
 * one the parsers normalise". This is that normalisation, which had not been
 * written yet.
 *
 * Location is still passed through unchanged. A broker wants to see Split,
 * not Croatia, when reading a specific week; the region exists for grouping.
 */

const PORT_REGIONS: Record<string, string> = {
  // Croatia
  split: "Croatia",
  dubrovnik: "Croatia",
  hvar: "Croatia",
  sibenik: "Croatia",
  trogir: "Croatia",
  zadar: "Croatia",
  pula: "Croatia",
  rovinj: "Croatia",
  opatija: "Croatia",
  kastela: "Croatia",

  // Greece
  athens: "Greece",
  piraeus: "Greece",
  alimos: "Greece",
  lavrio: "Greece",
  mykonos: "Greece",
  santorini: "Greece",
  paros: "Greece",
  naxos: "Greece",
  corfu: "Greece",
  rhodes: "Greece",
  kos: "Greece",
  crete: "Greece",
  heraklion: "Greece",
  zakynthos: "Greece",
  lefkada: "Greece",

  // Italy
  naples: "Italy",
  napoli: "Italy",
  amalfi: "Italy",
  positano: "Italy",
  capri: "Italy",
  portofino: "Italy",
  genoa: "Italy",
  genova: "Italy",
  viareggio: "Italy",
  civitavecchia: "Italy",
  rome: "Italy",
  venice: "Italy",
  sorrento: "Italy",

  // Sardinia is its own charter region rather than simply Italy, because
  // brokers sell it separately and the map has a marker for it.
  olbia: "Sardinia",
  "porto cervo": "Sardinia",
  cagliari: "Sardinia",
  alghero: "Sardinia",
  "porto rotondo": "Sardinia",

  // Sicily
  palermo: "Sicily",
  catania: "Sicily",
  messina: "Sicily",
  taormina: "Sicily",

  // France
  antibes: "France",
  cannes: "France",
  nice: "France",
  "saint-tropez": "France",
  "st tropez": "France",
  "saint tropez": "France",
  marseille: "France",
  "la ciotat": "France",
  toulon: "France",
  "golfe-juan": "France",

  // Monaco
  monaco: "Monaco",
  "monte carlo": "Monaco",
  "port hercule": "Monaco",

  // Spain and the Balearics
  palma: "Spain",
  ibiza: "Spain",
  barcelona: "Spain",
  "puerto banus": "Spain",
  valencia: "Spain",
  mallorca: "Spain",
  menorca: "Spain",
  formentera: "Spain",

  // Turkey
  bodrum: "Turkey",
  gocek: "Turkey",
  marmaris: "Turkey",
  fethiye: "Turkey",
  antalya: "Turkey",
  tuzla: "Turkey",
  istanbul: "Turkey",

  // Elsewhere in the Mediterranean
  valletta: "Malta",
  kotor: "Montenegro",
  tivat: "Montenegro",
  "porto montenegro": "Montenegro",
};

/**
 * Region names a sheet may write directly. Passed through as themselves so a
 * source that already writes "Croatia" is not sent to the port lookup and
 * discarded for not being a port.
 */
const KNOWN_REGIONS = new Set([
  "croatia",
  "greece",
  "greek islands",
  "cyclades",
  "ionian",
  "italy",
  "sardinia",
  "sicily",
  "amalfi coast",
  "corsica",
  "france",
  "french riviera",
  "monaco",
  "spain",
  "balearics",
  "turkey",
  "montenegro",
  "malta",
  "crete",
  "caribbean",
  "bahamas",
  "mediterranean",
]);

/**
 * Returns the region for a location, or null when it cannot be resolved.
 *
 * Null rather than a guess. An unresolved place still reaches the dashboard
 * as a location and appears in the destinations list; it simply has no map
 * marker, which is the behaviour the map already documents for unknown
 * regions. Inventing a region to force a marker would put yachts on the wrong
 * part of the map, which is worse than a short list.
 */
export function resolveRegion(location: string | null): string | null {
  if (!location) {
    return null;
  }

  /*
   * Sheets annotate places: "Trogir (refit)", "Split - berth 4", "Athens,
   * Greece". The parenthetical and anything after a separator is commentary
   * about the week, not part of the place name.
   */
  const cleaned = location
    .replace(/\([^)]*\)/g, " ")
    .split(/[,/|]|\s[-–—]\s/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!cleaned) {
    return null;
  }

  if (KNOWN_REGIONS.has(cleaned)) {
    // Restore the sheet's own capitalisation rather than lowercasing it.
    return location.trim().replace(/\([^)]*\)/g, "").trim();
  }

  return PORT_REGIONS[cleaned] ?? null;
}