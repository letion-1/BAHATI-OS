import * as cheerio from "cheerio";
// Element is cheerio's underlying DOM node type, re-exported by domhandler.
// Using it instead of `any` keeps .attr()/.children() type-checked.
import type { Element } from "domhandler";

import type {
  PageSignals,
  RenderedCalendarCell,
  RenderedCalendarLegend,
  RenderedPageSignals,
} from "./types";

const MAX_VISIBLE_TEXT =
  45_000;

const MAX_HTML_EXCERPT =
  55_000;

const MAX_EMBEDDED_JSON =
  30;

const MAX_LINKS =
  120;

const RENDER_SIGNAL_ELEMENT_ID =
  "__INTRIGUE_RENDER_SIGNALS__";

export function collectPageSignals({
  html,
  url,
}: {
  html: string;
  url: string;
}): PageSignals {
  const $ =
    cheerio.load(
      html
    );

  const rendered =
    collectRenderedSignals(
      $
    );

  const jsonLd =
    collectJsonLd(
      $
    );

  const embeddedJson =
    collectEmbeddedJson(
      html
    );

  $(
    "script, style, noscript, template"
  ).each(
    (
      _,
      element
    ) => {
      if (
        $(element).is(
          'script[type="application/ld+json"]'
        )
      ) {
        return;
      }

      $(element).remove();
    }
  );

  const title =
    cleanText(
      $("title")
        .first()
        .text()
    ) ||
    rendered?.title ||
    null;

  const description =
    cleanText(
      $(
        'meta[name="description"]'
      ).attr(
        "content"
      ) ??
        $(
          'meta[property="og:description"]'
        ).attr(
          "content"
        ) ??
        ""
    ) ||
    null;

  const normalVisibleText =
    cleanText(
      $("body").text()
    );

  const renderedVisibleText =
    rendered?.snapshots
      .map(
        (
          snapshot
        ) =>
          snapshot.visibleText
      )
      .filter(Boolean)
      .join(
        "\n\n"
      ) ??
    "";

  const visibleText =
    cleanText(
      [
        normalVisibleText,
        renderedVisibleText,
      ].join(
        "\n\n"
      )
    ).slice(
      0,
      MAX_VISIBLE_TEXT
    );

  const calendarCells =
    deduplicateCalendarCells(
      rendered?.snapshots.flatMap(
        (
          snapshot
        ) =>
          snapshot.cells
      ) ??
      []
    );

  const renderedLegends =
    deduplicateLegends(
      rendered?.snapshots.flatMap(
        (
          snapshot
        ) =>
          snapshot.legends
      ) ??
      []
    );

  const monthHeadings =
    Array.from(
      new Set(
        rendered?.snapshots.flatMap(
          (
            snapshot
          ) =>
            snapshot.monthHeadings
        ) ??
        []
      )
    ).slice(
      0,
      48
    );

  const domCalendarText =
    collectCalendarText(
      $
    );

  const renderedCalendarText =
    rendered?.snapshots
      .map(
        (
          snapshot
        ) =>
          [
            `Snapshot: ${snapshot.name}`,

            snapshot.monthHeadings.length
              ? `Months: ${snapshot.monthHeadings.join(", ")}`
              : "",

            snapshot.calendarText,

            snapshot.cells.length
              ? `Structured calendar cells:\n${JSON.stringify(
                  snapshot.cells.slice(
                    0,
                    2500
                  )
                )}`
              : "",

            snapshot.legends.length
              ? `Rendered legends:\n${JSON.stringify(
                  snapshot.legends
                )}`
              : "",
          ]
            .filter(Boolean)
            .join(
              "\n"
            )
      )
      .join(
        "\n\n"
      ) ??
    "";

  const networkText =
    rendered?.networkPayloads.length
      ? `Calendar-related browser network responses:\n${JSON.stringify(
          rendered.networkPayloads.slice(
            0,
            20
          )
        )}`
      : "";

  const calendarText =
    cleanText(
      [
        domCalendarText,
        renderedCalendarText,
        networkText,
      ].join(
        "\n\n"
      )
    ).slice(
      0,
      150_000
    );

  return {
    url:
      rendered?.finalUrl ||
      url,

    title,

    description,

    visibleText,

    calendarText,

    htmlExcerpt:
      createHtmlExcerpt(
        $
      ),

    jsonLd,

    embeddedJson: [
      ...embeddedJson,

      ...(
        rendered?.networkPayloads ??
        []
      ),
    ].slice(
      0,
      50
    ),

    links:
      collectLinks(
        $,
        rendered?.finalUrl ||
          url
      ),

    colorLegend:
      mergeColorLegends(
        collectColorLegend(
          $
        ),
        renderedLegends
      ),

    calendarCells,

    renderedLegends,

    monthHeadings,

    networkPayloads:
      rendered?.networkPayloads ??
      [],

    renderedSnapshots:
      rendered?.snapshots.map(
        (
          snapshot
        ) => ({
          name:
            snapshot.name,

          calendarText:
            snapshot.calendarText,

          monthHeadings:
            snapshot.monthHeadings,

          cellCount:
            snapshot.cells.length,
        })
      ) ??
      [],
  };
}

function collectRenderedSignals(
  $: cheerio.CheerioAPI
): RenderedPageSignals | null {
  const raw =
    $(
      `#${RENDER_SIGNAL_ELEMENT_ID}`
    )
      .first()
      .text()
      .trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        raw
      ) as RenderedPageSignals;

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      !Array.isArray(
        parsed.snapshots
      ) ||
      !Array.isArray(
        parsed.networkPayloads
      )
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function collectCalendarText(
  $: cheerio.CheerioAPI
): string {
  const selectors = [
    "[class*='calendar']",
    "[id*='calendar']",
    "[class*='availability']",
    "[id*='availability']",
    "[class*='booking']",
    "[id*='booking']",
    "[class*='schedule']",
    "[id*='schedule']",
    "table",
  ];

  const chunks:
    string[] =
      [];

  const seen =
    new Set<string>();

  for (
    const selector
    of selectors
  ) {
    $(
      selector
    )
      .slice(
        0,
        80
      )
      .each(
        (
          _,
          element
        ) => {
          const text =
            cleanText(
              $(
                element
              ).text()
            );

          if (
            !text ||
            seen.has(
              text
            )
          ) {
            return;
          }

          seen.add(
            text
          );

          chunks.push(
            text
          );
        }
      );
  }

  return chunks.join(
    "\n\n"
  );
}

function createHtmlExcerpt(
  $: cheerio.CheerioAPI
): string {
  const selectors = [
    "[class*='calendar']",
    "[id*='calendar']",
    "[class*='availability']",
    "[id*='availability']",
    "[class*='booking']",
    "[id*='booking']",
    "table",
    "main",
  ];

  const chunks:
    string[] =
      [];

  let length =
    0;

  for (
    const selector
    of selectors
  ) {
    $(
      selector
    )
      .slice(
        0,
        40
      )
      .each(
        (
          _,
          element
        ) => {
          if (
            length >=
            MAX_HTML_EXCERPT
          ) {
            return false;
          }

          const elementHtml =
            $.html(
              element
            );

          if (!elementHtml) {
            return;
          }

          const compact =
            elementHtml
              .replace(
                /\s+/g,
                " "
              )
              .trim();

          if (!compact) {
            return;
          }

          chunks.push(
            compact
          );

          length +=
            compact.length;
        }
      );
  }

  return chunks
    .join(
      "\n"
    )
    .slice(
      0,
      MAX_HTML_EXCERPT
    );
}

function collectJsonLd(
  $: cheerio.CheerioAPI
): unknown[] {
  const values:
    unknown[] =
      [];

  $(
    'script[type="application/ld+json"]'
  )
    .slice(
      0,
      20
    )
    .each(
      (
        _,
        element
      ) => {
        const raw =
          $(
            element
          )
            .text()
            .trim();

        if (!raw) {
          return;
        }

        try {
          values.push(
            JSON.parse(
              raw
            )
          );
        } catch {
          // Ignore malformed JSON-LD.
        }
      }
    );

  return values;
}

function collectEmbeddedJson(
  html: string
): unknown[] {
  const results:
    unknown[] =
      [];

  const patterns = [
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,

    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];

  for (
    const pattern
    of patterns
  ) {
    let match:
      RegExpExecArray |
      null;

    while (
      results.length <
        MAX_EMBEDDED_JSON &&
      (
        match =
          pattern.exec(
            html
          )
      )
    ) {
      const raw =
        match[1]?.trim();

      if (!raw) {
        continue;
      }

      try {
        results.push(
          JSON.parse(
            raw
          )
        );
      } catch {
        // Ignore malformed embedded JSON.
      }
    }
  }

  return results;
}

function collectLinks(
  $: cheerio.CheerioAPI,
  pageUrl: string
): string[] {
  const links =
    new Set<string>();

  $(
    "a[href]"
  )
    .slice(
      0,
      500
    )
    .each(
      (
        _,
        element
      ) => {
        const href =
          $(
            element
          )
            .attr(
              "href"
            )
            ?.trim();

        if (!href) {
          return;
        }

        try {
          links.add(
            new URL(
              href,
              pageUrl
            ).toString()
          );
        } catch {
          // Ignore malformed links.
        }
      }
    );

  return Array
    .from(
      links
    )
    .slice(
      0,
      MAX_LINKS
    );
}

function collectColorLegend(
  $: cheerio.CheerioAPI
): Array<{
  label: string;
  color: string | null;
}> {
  const results:
    Array<{
      label: string;
      color: string | null;
    }> =
      [];

  const seen =
    new Set<string>();

  $(
    "li, span, div, td"
  )
    .slice(
      0,
      3_000
    )
    .each(
      (
        _,
        element
      ) => {
        const node =
          $(
            element
          );

        const label =
          cleanText(
            node.text()
          );

        if (
          !label ||
          label.length >
            80 ||
          !/(available|booked|booking|hold|option|reserved|transit|unavailable|blocked|maintenance)/i.test(
            label
          )
        ) {
          return;
        }

        const style =
          node.attr(
            "style"
          ) ??
          "";

        const className =
          node.attr(
            "class"
          ) ??
          "";

        const color =
          extractCssColor(
            style
          ) ??
          extractColorFromChild(
            $,
            node
          ) ??
          semanticColor(
            className
          );

        const key =
          `${label.toLowerCase()}:${color ?? "none"}`;

        if (
          seen.has(
            key
          )
        ) {
          return;
        }

        seen.add(
          key
        );

        results.push({
          label,
          color,
        });
      }
    );

  return results.slice(
    0,
    40
  );
}

function extractColorFromChild(
  $: cheerio.CheerioAPI,
  node: cheerio.Cheerio<Element>
): string | null {
  let result:
    string |
    null =
      null;

  node
    .find(
      "*"
    )
    .slice(
      0,
      8
    )
    .each(
      (
        _,
        child
      ) => {
        const style =
          $(
            child
          ).attr(
            "style"
          ) ??
          "";

        const color =
          extractCssColor(
            String(
              style
            )
          );

        if (color) {
          result =
            color;

          return false;
        }
      }
    );

  return result;
}

function extractCssColor(
  style: string
): string | null {
  const hex =
    /(?:background|background-color|color)\s*:\s*(#[0-9a-f]{3,8})/i.exec(
      style
    );

  if (hex) {
    return hex[1]
      .toUpperCase();
  }

  const rgb =
    /(?:background|background-color|color)\s*:\s*(rgba?\([^)]*\))/i.exec(
      style
    );

  return rgb?.[1] ??
    null;
}

function semanticColor(
  value: string
): string | null {
  const normalized =
    value.toLowerCase();

  if (
    /green|success|booked/.test(
      normalized
    )
  ) {
    return "semantic:green";
  }

  if (
    /red|danger|hold/.test(
      normalized
    )
  ) {
    return "semantic:red";
  }

  if (
    /yellow|warning|transit|option/.test(
      normalized
    )
  ) {
    return "semantic:yellow";
  }

  if (
    /gray|grey|muted|unavailable/.test(
      normalized
    )
  ) {
    return "semantic:grey";
  }

  return null;
}

function deduplicateCalendarCells(
  cells: RenderedCalendarCell[]
): RenderedCalendarCell[] {
  const results =
    new Map<
      string,
      RenderedCalendarCell
    >();

  for (
    const cell
    of cells
  ) {
    const key = [
      cell.date ??
        "",
      cell.ariaLabel ??
        "",
      cell.title ??
        "",
      cell.text,
      cell.className,
      cell.backgroundColor ??
        "",
      cell.monthContext ??
        "",
    ].join(
      "::"
    );

    if (
      !results.has(
        key
      )
    ) {
      results.set(
        key,
        cell
      );
    }
  }

  return Array
    .from(
      results.values()
    )
    .slice(
      0,
      5000
    );
}

function deduplicateLegends(
  legends:
    RenderedCalendarLegend[]
): RenderedCalendarLegend[] {
  const results =
    new Map<
      string,
      RenderedCalendarLegend
    >();

  for (
    const legend
    of legends
  ) {
    const key = [
      legend.label.toLowerCase(),
      legend.backgroundColor ??
        "",
      legend.color ??
        "",
    ].join(
      "::"
    );

    if (
      !results.has(
        key
      )
    ) {
      results.set(
        key,
        legend
      );
    }
  }

  return Array
    .from(
      results.values()
    )
    .slice(
      0,
      80
    );
}

function mergeColorLegends(
  staticLegends:
    Array<{
      label: string;
      color: string | null;
    }>,
  renderedLegends:
    RenderedCalendarLegend[]
): Array<{
  label: string;
  color: string | null;
}> {
  const merged =
    new Map<
      string,
      {
        label: string;
        color: string | null;
      }
    >();

  for (
    const legend
    of staticLegends
  ) {
    const key =
      `${legend.label.toLowerCase()}:${legend.color ?? "none"}`;

    merged.set(
      key,
      legend
    );
  }

  for (
    const legend
    of renderedLegends
  ) {
    const color =
      legend.backgroundColor ??
      legend.color;

    const key =
      `${legend.label.toLowerCase()}:${color ?? "none"}`;

    if (
      !merged.has(
        key
      )
    ) {
      merged.set(
        key,
        {
          label:
            legend.label,

          color,
        }
      );
    }
  }

  return Array
    .from(
      merged.values()
    )
    .slice(
      0,
      80
    );
}

function cleanText(
  value: string
): string {
  return value
    .replace(
      /\u00a0/g,
      " "
    )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n\s*\n+/g,
      "\n"
    )
    .trim();
}