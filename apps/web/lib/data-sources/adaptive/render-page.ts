import type {
  RenderedPageSignals,
} from "./types";

const DEFAULT_BROWSERLESS_FUNCTION_ENDPOINT =
  "https://production-ams.browserless.io/function";

const RENDER_SIGNAL_ELEMENT_ID =
  "__INTRIGUE_RENDER_SIGNALS__";

type BrowserlessFunctionResponse = {
  data?: RenderedPageSignals;
  type?: string;
};

export async function renderWebsiteHtml(
  sourceUrl: string
): Promise<string | null> {
  const token =
    process.env.BROWSERLESS_TOKEN?.trim();

  if (!token) {
    return null;
  }

  const endpoint =
    resolveFunctionEndpoint();

  const requestUrl =
    new URL(endpoint);

  requestUrl.searchParams.set(
    "token",
    token
  );

  const response =
    await fetch(
      requestUrl,
      {
        method: "POST",
        cache: "no-store",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          code:
            BROWSER_FUNCTION_CODE,

          context: {
            sourceUrl,
          },
        }),
      }
    );

  if (!response.ok) {
    const detail =
      await response
        .text()
        .catch(() => "");

    throw new Error(
      `Rendered website inspection failed with status ${response.status}` +
        (
          detail
            ? `: ${detail.slice(0, 500)}`
            : "."
        )
    );
  }

  const payload =
    (
      await response.json()
    ) as
      | BrowserlessFunctionResponse
      | RenderedPageSignals;

  const rendered =
    unwrapRenderedResult(
      payload
    );

  if (
    !rendered ||
    !rendered.html.trim()
  ) {
    return null;
  }

  return injectRenderedSignals(
    rendered.html,
    rendered
  );
}

function resolveFunctionEndpoint(): string {
  const configured =
    process.env
      .BROWSERLESS_FUNCTION_ENDPOINT
      ?.trim();

  if (configured) {
    return configured;
  }

  const contentEndpoint =
    process.env
      .BROWSERLESS_CONTENT_ENDPOINT
      ?.trim();

  if (contentEndpoint) {
    return contentEndpoint.replace(
      /\/content\/?$/i,
      "/function"
    );
  }

  return DEFAULT_BROWSERLESS_FUNCTION_ENDPOINT;
}

function unwrapRenderedResult(
  payload:
    | BrowserlessFunctionResponse
    | RenderedPageSignals
): RenderedPageSignals | null {
  if (
    isRenderedPageSignals(
      payload
    )
  ) {
    return payload;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    isRenderedPageSignals(
      payload.data
    )
  ) {
    return payload.data;
  }

  return null;
}

function isRenderedPageSignals(
  value: unknown
): value is RenderedPageSignals {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  return (
    typeof record.html ===
      "string" &&
    typeof record.finalUrl ===
      "string" &&
    Array.isArray(
      record.snapshots
    ) &&
    Array.isArray(
      record.networkPayloads
    )
  );
}

function injectRenderedSignals(
  html: string,
  signals: RenderedPageSignals
): string {
  const serialized =
    JSON.stringify(
      {
        title:
          signals.title,

        finalUrl:
          signals.finalUrl,

        snapshots:
          signals.snapshots,

        networkPayloads:
          signals.networkPayloads,
      }
    )
      .replace(
        /</g,
        "\\u003c"
      )
      .replace(
        />/g,
        "\\u003e"
      )
      .replace(
        /&/g,
        "\\u0026"
      );

  const script =
    `<script id="${RENDER_SIGNAL_ELEMENT_ID}" ` +
    `type="application/json">${serialized}</script>`;

  if (
    /<\/body>/i.test(
      html
    )
  ) {
    return html.replace(
      /<\/body>/i,
      `${script}</body>`
    );
  }

  return `${html}${script}`;
}

const BROWSER_FUNCTION_CODE = String.raw`
export default async ({ page, context }) => {
  const sourceUrl = context.sourceUrl;

  const networkPayloads = [];
  const seenNetworkPayloads = new Set();

  const cleanText = (value) =>
    String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim();

  const isInterestingUrl = (value) =>
    /(calendar|availability|booking|schedule|reservation|charter|yacht|fleet)/i.test(
      value
    );

  const saveNetworkPayload = (value) => {
    try {
      const serialized = JSON.stringify(value);

      if (
        !serialized ||
        serialized.length > 120000 ||
        seenNetworkPayloads.has(serialized)
      ) {
        return;
      }

      seenNetworkPayloads.add(serialized);
      networkPayloads.push(value);
    } catch {
      // Ignore values that cannot be serialized.
    }
  };

  page.on("response", async (response) => {
    if (networkPayloads.length >= 30) {
      return;
    }

    const url = response.url();
    const headers = response.headers();
    const contentType = headers["content-type"] ?? "";

    if (
      !isInterestingUrl(url) &&
      !contentType.includes("json")
    ) {
      return;
    }

    try {
      if (contentType.includes("json")) {
        const json = await response.json();

        saveNetworkPayload({
          url,
          status: response.status(),
          contentType,
          body: json,
        });

        return;
      }

      const text = await response.text();

      if (
        text.length <= 120000 &&
        /(calendar|availability|booking|booked|hold|transit|unavailable)/i.test(
          text
        )
      ) {
        saveNetworkPayload({
          url,
          status: response.status(),
          contentType,
          body: text,
        });
      }
    } catch {
      // Some responses cannot be read twice or have no body.
    }
  });

  await page.setViewport({
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
  });

  await page.goto(sourceUrl, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await new Promise((resolve) =>
    setTimeout(resolve, 2500)
  );

  // Bring lazy-loaded calendar sections into the viewport before inspection.
  await page.evaluate(() => {
    const target =
      document.querySelector(
        "[id*='calendar'], [class*='calendar'], [id*='availability'], [class*='availability']"
      );

    target?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  });

  await new Promise((resolve) =>
    setTimeout(resolve, 1500)
  );

  const clickText = async (patterns) => {
    return page.evaluate((values) => {
      const normalizedPatterns = values.map(
        (value) => value.toLowerCase()
      );

      const candidates = Array.from(
        document.querySelectorAll(
          "button, a, [role='button'], input[type='button'], input[type='submit']"
        )
      );

      for (const element of candidates) {
        const text = String(
          element.textContent ??
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          element.getAttribute("value") ??
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

        if (!text) {
          continue;
        }

        if (
          normalizedPatterns.some(
            (pattern) =>
              text === pattern ||
              text.includes(pattern)
          )
        ) {
          try {
            element.click();
            return text;
          } catch {
            // Try the next candidate.
          }
        }
      }

      return null;
    }, patterns);
  };

  const waitForAvailabilityCalendar = async () => {
    try {
      await page.waitForFunction(
        () => {
          const bodyText =
            document.body?.innerText ?? "";

          const stillLoading =
            /loading\s+availability/i.test(
              bodyText
            );

          const hasMonthHeading =
            /(january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}/i.test(
              bodyText
            );

          const hasStatusLegend =
            /\b(booked|hold|transit|unavailable|available)\b/i.test(
              bodyText
            );

          const hasCalendarCells =
            document.querySelectorAll(
              "[data-date], [data-day], [class*='calendar'] td, [class*='calendar'] button, [class*='availability'] td, [class*='availability'] button"
            ).length > 5;

          return (
            !stillLoading &&
            hasMonthHeading &&
            (
              hasStatusLegend ||
              hasCalendarCells
            )
          );
        },
        {
          timeout: 20000,
          polling: 500,
        }
      );
    } catch {
      // Continue with the best DOM state available.
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1200)
    );
  };

  const collectSnapshot = async (name) => {
    return page.evaluate((snapshotName) => {
      const clean = (value) =>
        String(value ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n+/g, "\n")
          .trim();

      const isTransparent = (value) =>
        !value ||
        value === "transparent" ||
        value === "rgba(0, 0, 0, 0)";

      const getBackground = (element) => {
        let current = element;

        for (let index = 0; index < 5 && current; index += 1) {
          const style =
            window.getComputedStyle(current);

          const before =
            window.getComputedStyle(
              current,
              "::before"
            );

          const after =
            window.getComputedStyle(
              current,
              "::after"
            );

          const backgroundColor =
            !isTransparent(
              style.backgroundColor
            )
              ? style.backgroundColor
              : null;

          const backgroundImage =
            style.backgroundImage &&
            style.backgroundImage !==
              "none"
              ? style.backgroundImage
              : null;

          const beforeBackground =
            before.backgroundImage &&
            before.backgroundImage !==
              "none"
              ? before.backgroundImage
              : (
                  !isTransparent(
                    before.backgroundColor
                  )
                    ? before.backgroundColor
                    : null
                );

          const afterBackground =
            after.backgroundImage &&
            after.backgroundImage !==
              "none"
              ? after.backgroundImage
              : (
                  !isTransparent(
                    after.backgroundColor
                  )
                    ? after.backgroundColor
                    : null
                );

          if (
            backgroundColor ||
            backgroundImage ||
            beforeBackground ||
            afterBackground
          ) {
            return {
              backgroundColor,
              backgroundImage,
              beforeBackground,
              afterBackground,
            };
          }

          current =
            current.parentElement;
        }

        return {
          backgroundColor: null,
          backgroundImage: null,
          beforeBackground: null,
          afterBackground: null,
        };
      };

      const getMonthContext = (element) => {
        let current = element;

        for (let depth = 0; depth < 7 && current; depth += 1) {
          const heading =
            current.querySelector(
              "h1, h2, h3, h4, h5, h6, caption, [class*='month'], [class*='title'], [class*='header']"
            );

          const text =
            clean(
              heading?.textContent
            );

          if (
            text &&
            /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i.test(
              text
            )
          ) {
            return text.slice(0, 160);
          }

          current =
            current.parentElement;
        }

        let sibling =
          element.parentElement;

        for (
          let index = 0;
          index < 8 && sibling;
          index += 1
        ) {
          sibling =
            sibling.previousElementSibling;

          const text =
            clean(
              sibling?.textContent
            );

          if (
            text &&
            /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i.test(
              text
            )
          ) {
            return text.slice(0, 160);
          }
        }

        return null;
      };

      const selectors = [
        "[data-date]",
        "[data-day]",
        "[data-status]",
        "[data-state]",
        "[aria-label*='202']",
        "[title*='202']",
        "[class*='calendar'] td",
        "[class*='calendar'] button",
        "[class*='calendar'] [class*='day']",
        "[class*='availability'] td",
        "[class*='availability'] button",
        "[class*='availability'] [class*='day']",
        "[id*='calendar'] td",
        "[id*='calendar'] button",
        "[id*='availability'] td",
        "[id*='availability'] button",
      ];

      const candidateSet =
        new Set();

      for (const selector of selectors) {
        for (
          const node
          of document.querySelectorAll(
            selector
          )
        ) {
          candidateSet.add(node);
        }
      }

      const cells = [];

      for (const node of candidateSet) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        const rectangle =
          node.getBoundingClientRect();

        if (
          rectangle.width < 8 ||
          rectangle.height < 8
        ) {
          continue;
        }

        const text =
          clean(
            node.textContent
          );

        const ariaLabel =
          clean(
            node.getAttribute(
              "aria-label"
            )
          ) || null;

        const title =
          clean(
            node.getAttribute(
              "title"
            )
          ) || null;

        const data = {};

        for (
          const attribute
          of Array.from(
            node.attributes
          )
        ) {
          if (
            attribute.name.startsWith(
              "data-"
            )
          ) {
            data[
              attribute.name
            ] =
              attribute.value;
          }
        }

        const rawDate =
          node.getAttribute(
            "data-date"
          ) ??
          node.getAttribute(
            "datetime"
          ) ??
          data["data-start-date"] ??
          data["data-day"] ??
          null;

        const computed =
          window.getComputedStyle(
            node
          );

        const parent =
          node.parentElement;

        const parentText =
          clean(
            parent?.textContent
          )
            .slice(
              0,
              300
            ) ||
          null;

        const background =
          getBackground(
            node
          );

        const record = {
          text:
            text.slice(
              0,
              200
            ),

          date:
            rawDate,

          ariaLabel,

          title,

          tagName:
            node.tagName.toLowerCase(),

          className:
            typeof node.className ===
              "string"
              ? node.className
              : "",

          id:
            node.id ||
            null,

          backgroundColor:
            background.backgroundColor,

          backgroundImage:
            background.backgroundImage,

          beforeBackground:
            background.beforeBackground,

          afterBackground:
            background.afterBackground,

          color:
            computed.color ||
            null,

          parentText,

          parentClassName:
            parent &&
            typeof parent.className ===
              "string"
              ? parent.className
              : null,

          monthContext:
            getMonthContext(
              node
            ),

          data,
        };

        const hasCalendarEvidence =
          Boolean(
            record.date ||
            record.ariaLabel ||
            record.title ||
            record.monthContext ||
            Object.keys(
              record.data
            ).length
          ) ||
          /\b(booked|booking|hold|reserved|option|transit|unavailable|available|blocked)\b/i.test(
            [
              record.text,
              record.className,
              record.parentClassName,
              record.parentText,
            ]
              .filter(Boolean)
              .join(" ")
          );

        const looksLikeDayNumber =
          /^\d{1,2}$/.test(
            record.text
          );

        if (
          hasCalendarEvidence ||
          looksLikeDayNumber
        ) {
          cells.push(
            record
          );
        }

        if (
          cells.length >= 4000
        ) {
          break;
        }
      }

      const legendCandidates =
        Array.from(
          document.querySelectorAll(
            "li, span, div, td, button"
          )
        );

      const legends = [];
      const seenLegends =
        new Set();

      for (
        const node
        of legendCandidates
      ) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        const text =
          clean(
            node.textContent
          );

        if (
          !text ||
          text.length > 80 ||
          !/(available|booked|booking|hold|option|reserved|transit|unavailable|blocked|maintenance)/i.test(
            text
          )
        ) {
          continue;
        }

        const style =
          window.getComputedStyle(
            node
          );

        const background =
          getBackground(
            node
          );

        const key =
          [
            text.toLowerCase(),
            background.backgroundColor,
            background.backgroundImage,
            background.beforeBackground,
            background.afterBackground,
            style.color,
          ].join(":");

        if (
          seenLegends.has(
            key
          )
        ) {
          continue;
        }

        seenLegends.add(
          key
        );

        legends.push({
          label:
            text.slice(
              0,
              80
            ),

          backgroundColor:
            background.backgroundColor,

          backgroundImage:
            background.backgroundImage,

          beforeBackground:
            background.beforeBackground,

          afterBackground:
            background.afterBackground,

          color:
            style.color ||
            null,

          className:
            typeof node.className ===
              "string"
              ? node.className
              : null,
        });

        if (
          legends.length >= 60
        ) {
          break;
        }
      }

      const monthHeadings =
        Array.from(
          document.querySelectorAll(
            "h1, h2, h3, h4, h5, h6, caption, [class*='month'], [class*='calendar-header'], [class*='calendar-title']"
          )
        )
          .map(
            (node) =>
              clean(
                node.textContent
              )
          )
          .filter(
            (text) =>
              /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i.test(
                text
              )
          )
          .filter(
            (
              value,
              index,
              values
            ) =>
              values.indexOf(
                value
              ) ===
              index
          )
          .slice(
            0,
            36
          );

      const calendarContainers =
        Array.from(
          document.querySelectorAll(
            "[class*='calendar'], [id*='calendar'], [class*='availability'], [id*='availability'], [class*='booking'], [id*='booking']"
          )
        )
          .map(
            (node) =>
              clean(
                node.textContent
              )
          )
          .filter(Boolean)
          .filter(
            (
              value,
              index,
              values
            ) =>
              values.indexOf(
                value
              ) ===
              index
          )
          .slice(
            0,
            40
          );

      return {
        name:
          snapshotName,

        visibleText:
          clean(
            document.body?.innerText
          ).slice(
            0,
            50000
          ),

        calendarText:
          calendarContainers
            .join(
              "\n\n"
            )
            .slice(
              0,
              50000
            ),

        cells,

        legends,

        monthHeadings,
      };
    }, name);
  };

  const snapshots = [];

  snapshots.push(
    await collectSnapshot(
      "initial-render"
    )
  );

  const calendarClick =
    await clickText([
      "calendar",
      "availability calendar",
      "availability",
    ]);

  if (calendarClick) {
    await waitForAvailabilityCalendar();

    snapshots.push(
      await collectSnapshot(
        "calendar-view"
      )
    );
  }

  const listClick =
    await clickText([
      "list view",
    ]);

  if (listClick) {
    await new Promise((resolve) =>
      setTimeout(resolve, 1800)
    );

    snapshots.push(
      await collectSnapshot(
        "list-view"
      )
    );
  }

  if (listClick) {
    const calendarReturn =
      await clickText([
        "calendar",
      ]);

    if (calendarReturn) {
      await waitForAvailabilityCalendar();

      snapshots.push(
        await collectSnapshot(
          "calendar-final"
        )
      );
    }
  }

  const html =
    await page.content();

  return {
    data: {
      title:
        await page.title(),

      finalUrl:
        page.url(),

      html,

      snapshots,

      networkPayloads:
        networkPayloads.slice(
          0,
          30
        ),
    },

    type:
      "application/json",
  };
};
`;