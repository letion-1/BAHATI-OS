import type {
  AvailabilityStatus,
} from "../parsers/types";

export type AdaptiveAvailabilityWindow = {
  yachtName: string;
  startDate: string;
  endDate: string;
  status: AvailabilityStatus;
  price: number | null;
  currency: string | null;
  location: string | null;
  region: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  notes: string | null;
  evidence: string | null;
  confidence: number;
};

export type AdaptiveYacht = {
  name: string;
  brochureUrl: string | null;
  currency: string | null;
  location: string | null;
  region: string | null;
  metadata: Record<string, unknown>;
};

export type AdaptiveExtraction = {
  title: string | null;

  strategy:
    | "embedded_json"
    | "rendered_dom"
    | "visual_calendar"
    | "mixed";

  confidence: number;

  legend: Array<{
    label: string;
    meaning: string;
    color: string | null;
  }>;

  yachts: AdaptiveYacht[];

  availability: AdaptiveAvailabilityWindow[];

  warnings: string[];
};

export type RenderedCalendarCell = {
  text: string;
  date: string | null;
  ariaLabel: string | null;
  title: string | null;
  tagName: string;
  className: string;
  id: string | null;
  backgroundColor: string | null;
  color: string | null;
  parentText: string | null;
  parentClassName: string | null;
  monthContext: string | null;
  data: Record<string, string>;
};

export type RenderedCalendarLegend = {
  label: string;
  backgroundColor: string | null;
  color: string | null;
  className: string | null;
};

export type RenderedPageSnapshot = {
  name: string;
  visibleText: string;
  calendarText: string;
  cells: RenderedCalendarCell[];
  legends: RenderedCalendarLegend[];
  monthHeadings: string[];
};

export type RenderedPageSignals = {
  title: string | null;
  finalUrl: string;
  html: string;
  snapshots: RenderedPageSnapshot[];
  networkPayloads: unknown[];
};

export type PageSignals = {
  url: string;
  title: string | null;
  description: string | null;
  visibleText: string;
  calendarText: string;
  htmlExcerpt: string;
  jsonLd: unknown[];
  embeddedJson: unknown[];
  links: string[];

  colorLegend: Array<{
    label: string;
    color: string | null;
  }>;

  calendarCells: RenderedCalendarCell[];

  renderedLegends: RenderedCalendarLegend[];

  monthHeadings: string[];

  networkPayloads: unknown[];

  renderedSnapshots: Array<{
    name: string;
    calendarText: string;
    monthHeadings: string[];
    cellCount: number;
  }>;
};