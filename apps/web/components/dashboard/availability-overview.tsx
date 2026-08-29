"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";

import { AvailabilityGlobe } from "./availability-globe";

/**
 * Availability overview: a rotating globe with a marker per charter region,
 * sized by how many yachts are open there, beside a ranked list of
 * destinations.
 *
 * This replaced a hand-drawn SVG of the Mediterranean. That map was six
 * polygons approximating a coastline, which was fine while every source was
 * Croatian and stopped being fine the moment a fleet spanned eight regions:
 * the shapes were too coarse to tell Sardinia from Sicily, and there was
 * nowhere to put a marker outside the basin.
 *
 * The globe is drawn by cobe, roughly five kilobytes of WebGL with no tiles
 * and no API key, so it costs no network request on dashboard load.
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

export function AvailabilityOverview({
  destinations,
}: {
  destinations: DestinationCount[];
}) {
  const markers = useMemo(
    () =>
      destinations
        .map((item) => {
          const coordinates = REGION_COORDINATES[item.region.toLowerCase()];

          if (!coordinates) {
            return null;
          }

          return {
            region: item.region,
            count: item.count,
            lat: coordinates.lat,
            lon: coordinates.lon,
          };
        })
        .filter(
          (marker): marker is NonNullable<typeof marker> => marker !== null
        ),
    [destinations]
  );

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
        <div className="rounded-2xl border border-border bg-background/40 p-2">
          <AvailabilityGlobe markers={markers} />

          {/*
            Named here rather than only on the sphere. Marker labels on a
            rotating globe are unreadable at this size and half of them face
            away at any moment, so the regions are spelled out underneath and
            the globe shows only where they are.
          */}
          {markers.length > 0 ? (
            <p className="px-2 pb-1 pt-2 text-center text-[11px] leading-5 text-muted-foreground">
              {markers
                .slice(0, 6)
                .map((marker) => marker.region)
                .join(" · ")}
              {markers.length > 6 ? ` and ${markers.length - 6} more` : ""}
            </p>
          ) : null}
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