export type YachtPlaceholderMedia = {
  hero: string;
  gallery: string[];
};

/**
 * Distinct stock yacht photography already bundled with Bahari OS.
 *
 * Duplicate JPG/PNG exports of the same scene are intentionally not repeated.
 * Uploaded broker photography always takes precedence over these fallbacks.
 */
export const YACHT_PLACEHOLDER_IMAGES = [
  "/proposal-yacht/hero-exterior.png",
  "/proposal-yacht/aerial-view.jpg",
  "/proposal-yacht/beach-club.jpg",
  "/proposal-yacht/jacuzzi-deck.png",
  "/proposal-yacht/master-cabin.jpg",
  "/proposal-yacht/salon.jpg",
] as const;

export function getYachtPlaceholderMedia(
  seed: string
): YachtPlaceholderMedia {
  const start =
    stableHash(seed) %
    YACHT_PLACEHOLDER_IMAGES.length;

  const rotated =
    Array.from(
      {
        length:
          YACHT_PLACEHOLDER_IMAGES.length,
      },
      (_, index) =>
        YACHT_PLACEHOLDER_IMAGES[
          (start + index) %
            YACHT_PLACEHOLDER_IMAGES.length
        ]
    );

  return {
    hero: rotated[0],
    gallery: rotated,
  };
}

function stableHash(
  value: string
): number {
  let hash = 2166136261;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^=
      value.charCodeAt(index);

    hash =
      Math.imul(
        hash,
        16777619
      ) >>> 0;
  }

  return hash;
}