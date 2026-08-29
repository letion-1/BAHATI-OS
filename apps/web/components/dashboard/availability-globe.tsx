"use client";

import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

/**
 * A rotating WebGL globe with a marker per charter region.
 *
 * cobe draws the sphere as a field of dots on a single canvas via WebGL,
 * which is about five kilobytes and needs no tiles, no API key and no network
 * request. That matters for a dashboard panel: a tile map would fetch imagery
 * on every load of a view nobody pans or zooms.
 *
 * The globe is decorative in the strict sense. Every number it encodes is
 * also in the destinations list beside it, so a browser without WebGL, a
 * screen reader, or a visitor who has asked for reduced motion loses nothing
 * but the animation.
 */

export type GlobeMarker = {
  region: string;
  count: number;
  lat: number;
  lon: number;
};

/**
 * cobe takes colours as 0-1 RGB triples, so the theme tokens cannot be passed
 * through as CSS variables. They are duplicated here as literals and kept in
 * step with globals.css by hand.
 *
 * Reading them back with getComputedStyle was the alternative and was worse:
 * it forces a synchronous style resolution on mount, and the values arrive as
 * hex strings that need parsing anyway.
 */
const THEME = {
  light: {
    // Warm parchment, matching --background #f5efe6.
    base: [0.83, 0.78, 0.72] as [number, number, number],
    marker: [0.29, 0.2, 0.15] as [number, number, number],
    glow: [0.96, 0.94, 0.9] as [number, number, number],
    dark: 0,
    diffuse: 0.4,
    opacity: 0.92,
  },
  dark: {
    base: [0.13, 0.17, 0.23] as [number, number, number],
    marker: [0.78, 0.64, 0.29] as [number, number, number],
    glow: [0.02, 0.03, 0.04] as [number, number, number],
    dark: 1,
    diffuse: 1.2,
    opacity: 1,
  },
};

export function AvailabilityGlobe({
  markers,
  className,
}: {
  markers: GlobeMarker[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * Rotation lives in a ref rather than state. It changes on every animation
   * frame, and a state update per frame would re-render the tree sixty times
   * a second to move a number cobe reads directly.
   */
  const rotationRef = useRef(0);

  const pointerInteractingRef = useRef<number | null>(null);
  const pointerMovementRef = useRef(0);

  const [isDark, setIsDark] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [failed, setFailed] = useState(false);

  /*
   * Theme is read from the html element's class, because that is what
   * app/layout.tsx and the theme toggle actually set. Observing it means the
   * globe recolours when the toggle is pressed rather than staying on the
   * palette it happened to mount with.
   */
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => setIsDark(root.classList.contains("dark"));

    sync();

    const observer = new MutationObserver(sync);

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => setReduceMotion(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || failed) {
      return;
    }

    let width = canvas.offsetWidth;

    const onResize = () => {
      width = canvas.offsetWidth;
    };

    window.addEventListener("resize", onResize);

    const palette = isDark ? THEME.dark : THEME.light;

    /*
     * Marker size scales with the square root of the share, so a region with
     * four times the availability draws a marker twice as wide rather than
     * four times. Area is what the eye compares, and linear radius would make
     * a busy region overwhelm the sphere.
     */
    const highest = Math.max(1, ...markers.map((marker) => marker.count));

    let globe: ReturnType<typeof createGlobe> | null = null;

    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio ?? 1, 2),
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.28,
        dark: palette.dark,
        diffuse: palette.diffuse,
        mapSamples: 15000,
        mapBrightness: isDark ? 5.4 : 2.4,
        baseColor: palette.base,
        markerColor: palette.marker,
        glowColor: palette.glow,
        opacity: palette.opacity,
        markers: markers.map((marker) => ({
          location: [marker.lat, marker.lon],
          size: 0.035 + Math.sqrt(marker.count / highest) * 0.055,
        })),
      });

      /*
       * cobe v2 drives animation through globe.update() rather than the
       * onRender callback v1 exposed, so the frame loop is ours to run.
       *
       * Worth being explicit about: this is the only place phi changes, and
       * it reads the refs directly rather than closing over state, so the
       * loop never needs restarting when a drag begins or ends.
       */
      let frame = 0;

      const tick = () => {
        if (pointerInteractingRef.current === null && !reduceMotion) {
          rotationRef.current += 0.0035;
        }

        globe?.update({
          phi: rotationRef.current + pointerMovementRef.current,
          width: width * 2,
          height: width * 2,
        });

        frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);

      // Faded in after the first frame, so the panel never shows a black
      // square while WebGL warms up.
      const timer = window.setTimeout(() => {
        canvas.style.opacity = "1";
      }, 120);

      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        window.removeEventListener("resize", onResize);
        globe?.destroy();
      };
    } catch (error) {
      /*
       * WebGL can be unavailable: an old browser, a blocked context, a
       * headless environment. The destinations list beside this carries the
       * same numbers, so the panel degrades to a quiet placeholder rather
       * than taking the dashboard down.
       */
      console.error("Globe failed to initialise:", error);
      setFailed(true);
      window.removeEventListener("resize", onResize);
      return;
    }
  }, [markers, isDark, reduceMotion, failed]);

  if (failed) {
    return (
      <div
        className={`flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-border ${className ?? ""}`}
      >
        <p className="max-w-[16rem] text-center text-sm leading-6 text-muted-foreground">
          The globe needs WebGL, which this browser has turned off. The regions
          are listed alongside.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative mx-auto aspect-square w-full max-w-[340px] ${className ?? ""}`}
    >
      <canvas
        ref={canvasRef}
        className="size-full cursor-grab opacity-0 transition-opacity duration-500 contain-layout contain-paint"
        role="img"
        aria-label={
          markers.length > 0
            ? `Globe showing open availability across ${markers.length} charter regions`
            : "Globe with no availability markers"
        }
        onPointerDown={(event) => {
          pointerInteractingRef.current =
            event.clientX - pointerMovementRef.current;
          event.currentTarget.style.cursor = "grabbing";
        }}
        onPointerUp={(event) => {
          pointerInteractingRef.current = null;
          event.currentTarget.style.cursor = "grab";
        }}
        onPointerOut={(event) => {
          pointerInteractingRef.current = null;
          event.currentTarget.style.cursor = "grab";
        }}
        onMouseMove={(event) => {
          if (pointerInteractingRef.current === null) {
            return;
          }

          const delta = event.clientX - pointerInteractingRef.current;

          pointerMovementRef.current = delta / 180;
        }}
        onTouchMove={(event) => {
          if (pointerInteractingRef.current === null || !event.touches[0]) {
            return;
          }

          const delta =
            event.touches[0].clientX - pointerInteractingRef.current;

          pointerMovementRef.current = delta / 220;
        }}
      />
    </div>
  );
}