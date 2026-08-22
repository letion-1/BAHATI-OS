"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";

/**
 * Availability overview: a Mediterranean map with a marker per charter
 * region, sized by how many yachts are open there, beside a ranked list of
 * destinations.
 *
 * Built from an inline SVG rather than a mapping library on purpose. A tile
 * map would pull in a dependency, make network requests on every dashboard
 * load, and need an API key. At this size the map is a shape that orients the
 * eye, not something anyone will pan or zoom, so the extra weight buys
 * nothing.
 *
 * All colour comes from the existing theme tokens, so this follows the
 * brand and switches with light and dark mode rather than hard-coding a
 * palette that would drift from the rest of the product.
 */

export type DestinationCount = {
  region: string;
  count: number;
};

/**
 * Approximate centre of each charter region, in degrees.
 *
 * Keys are matched case-insensitively against the region label coming from
 * the availability data. A region that is not listed still appears in the
 * destinations panel; it simply has no marker on the map.
 */
const REGION_COORDINATES: Record<string, { lat: number; lon: number }> = {
  croatia: { lat: 43.5, lon: 16.4 },
  greece: { lat: 37.9, lon: 23.7 },
  "greek islands": { lat: 37.0, lon: 25.3 },
  cyclades: { lat: 37.1, lon: 25.2 },
  ionian: { lat: 38.4, lon: 20.7 },
  italy: { lat: 41.9, lon: 12.5 },
  sardinia: { lat: 40.1, lon: 9.1 },
  sicily: { lat: 37.6, lon: 14.0 },
  "amalfi coast": { lat: 40.6, lon: 14.6 },
  naples: { lat: 40.8, lon: 14.3 },
  corsica: { lat: 42.1, lon: 9.1 },
  france: { lat: 43.3, lon: 6.6 },
  "french riviera": { lat: 43.5, lon: 7.0 },
  monaco: { lat: 43.7, lon: 7.4 },
  spain: { lat: 39.6, lon: 2.9 },
  balearics: { lat: 39.6, lon: 2.9 },
  ibiza: { lat: 38.9, lon: 1.4 },
  mallorca: { lat: 39.6, lon: 3.0 },
  turkey: { lat: 36.8, lon: 28.3 },
  montenegro: { lat: 42.3, lon: 18.8 },
  malta: { lat: 35.9, lon: 14.4 },
  crete: { lat: 35.3, lon: 24.8 },
};

/** Bounding box of the drawn map, in degrees. */
const BOUNDS = { minLon: -6, maxLon: 36, minLat: 30, maxLat: 47 };

const VIEW = { width: 420, height: 200 };

function project(lat: number, lon: number) {
  const x =
    ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * VIEW.width;

  // SVG y grows downward, latitude grows upward.
  const y =
    ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * VIEW.height;

  return { x, y };
}

/**
 * Simplified Mediterranean landmass. Deliberately low-fidelity: enough for
 * the eye to recognise the basin and place a marker, without the weight of
 * real coastline data.
 */
const LANDMASS = [
  // Iberian peninsula
  "M 0 62 L 34 55 L 58 60 L 74 78 L 66 100 L 40 108 L 12 96 L 0 84 Z",
  // France and the northern arc
  "M 58 46 L 96 38 L 122 44 L 132 60 L 116 70 L 88 66 L 66 58 Z",
  // Italy
  "M 128 52 L 146 58 L 158 84 L 172 106 L 168 122 L 152 116 L 142 92 L 130 70 Z",
  // Balkans and Greece
  "M 176 46 L 214 44 L 236 56 L 248 78 L 236 96 L 214 92 L 196 74 L 180 60 Z",
  // Turkey
  "M 250 52 L 310 48 L 348 58 L 356 76 L 320 84 L 276 76 L 252 66 Z",
  // North Africa
  "M 0 150 L 80 138 L 170 134 L 260 140 L 340 148 L 420 152 L 420 200 L 0 200 Z",
];

const ISLANDS = [
  // Corsica
  "M 118 76 L 126 74 L 128 88 L 120 92 Z",
  // Sardinia
  "M 116 96 L 126 94 L 128 112 L 118 116 Z",
  // Sicily
  "M 148 122 L 166 120 L 168 132 L 150 134 Z",
  // Balearics
  "M 78 92 L 90 90 L 92 98 L 80 100 Z",
  // Crete
  "M 226 130 L 254 128 L 256 136 L 228 138 Z",
  // Cyprus
  "M 330 106 L 348 104 L 350 112 L 332 114 Z",
];

export function AvailabilityOverview({
  destinations,
}: {
  destinations: DestinationCount[];
}) {
  const markers = useMemo(() => {
    const highest = Math.max(1, ...destinations.map((item) => item.count));

    return destinations
      .map((item) => {
        const coordinates = REGION_COORDINATES[item.region.toLowerCase()];

        if (!coordinates) {
          return null;
        }

        const { x, y } = project(coordinates.lat, coordinates.lon);

        // Area, not radius, scales with the count, so a region with twice the
        // availability looks twice as large rather than four times.
        const radius = 4 + Math.sqrt(item.count / highest) * 9;

        return { ...item, x, y, radius };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [destinations]);

  const total = destinations.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="ui-panel rounded-[22px] p-5 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg text-foreground">
            Availability overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total > 0
              ? `${total} open week${total === 1 ? "" : "s"} across ${markers.length || destinations.length} region${destinations.length === 1 ? "" : "s"}`
              : "No open availability yet"}
          </p>
        </div>

        <MapPin className="size-4 shrink-0 text-muted-foreground" />
      </header>

      {destinations.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border">
          <p className="max-w-xs text-center text-sm leading-6 text-muted-foreground">
            Connect a data source and availability will appear here, grouped by
            cruising region.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-background/40">
          <svg
            viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Map of the Mediterranean showing availability across ${markers.length} regions`}
          >
            {/* Sea */}
            <rect
              width={VIEW.width}
              height={VIEW.height}
              className="fill-muted/25"
            />

            {LANDMASS.map((path, index) => (
              <path
                key={`land-${index}`}
                d={path}
                className="fill-muted/70 stroke-border"
                strokeWidth={0.5}
              />
            ))}

            {ISLANDS.map((path, index) => (
              <path
                key={`island-${index}`}
                d={path}
                className="fill-muted/70 stroke-border"
                strokeWidth={0.5}
              />
            ))}

            {markers.map((marker) => (
              <g key={marker.region}>
                {/* Halo, so a marker stays visible against the landmass. */}
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={marker.radius + 4}
                  className="fill-primary/15"
                />
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={marker.radius}
                  className="fill-primary/70 stroke-primary"
                  strokeWidth={1}
                />
                <title>
                  {marker.region}: {marker.count} open week
                  {marker.count === 1 ? "" : "s"}
                </title>
              </g>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}

export function TopDestinations({
  destinations,
}: {
  destinations: DestinationCount[];
}) {
  const highest = Math.max(1, ...destinations.map((item) => item.count));

  return (
    <section className="ui-panel rounded-[22px] p-5 sm:p-6">
      <header className="mb-4">
        <h2 className="font-heading text-lg text-foreground">
          Top destinations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where your open availability is concentrated
        </p>
      </header>

      {destinations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing to rank yet.
        </p>
      ) : (
        <ol className="space-y-3.5">
          {destinations.map((item) => (
            <li key={item.region}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {item.region}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {item.count}
                </span>
              </div>

              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{
                    width: `${Math.max(4, (item.count / highest) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}