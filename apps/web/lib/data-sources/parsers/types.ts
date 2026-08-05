import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCell,
} from "../source-types";

export type ParserLayout =
  | "single_yacht_weekly_calendar"
  | "horizontal_yacht_calendar"
  | "monthly_calendar"
  | "booking_table"
  | "generic_table"
  | "unknown";

export type ParserDetection = {
  layout: ParserLayout;
  confidence: number;
  parserId: string;
  reasons: string[];
  sheetName: string | null;
};

export type NormalizedYacht = {
  sourceKey: string;
  name: string;
  sourceSheet: string;
  sourceRow: number | null;
  sourceColumn: number | null;
  brochureUrl: string | null;
  metadata: Record<string, unknown>;
};

export type AvailabilityStatus =
  | "available"
  | "booked"
  | "reserved"
  | "option"
  | "unavailable"
  | "out_of_service"
  | "unknown";

export type NormalizedAvailability = {
  sourceKey: string;
  yachtSourceKey: string;
  yachtName: string;
  startDate: string | null;
  endDate: string | null;
  status: AvailabilityStatus;
  price: number | null;
  currency: string | null;
  rawValue: SerializableCellValue;
  sourceSheet: string;
  sourceCell: string | null;
  sourceRow: number | null;
  sourceColumn: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

export type ParserResult = {
  parserId: string;
  layout: ParserLayout;
  confidence: number;
  yachts: NormalizedYacht[];
  availability: NormalizedAvailability[];
  warnings: string[];
  metadata: {
    sheetName: string | null;
    detectedYear: number | null;
    yachtCount: number;
    availabilityCount: number;
    [key: string]: unknown;
  };
};

export type WorkbookParser = {
  id: string;
  layout: ParserLayout;
  detect(workbook: ParsedWorkbook): ParserDetection;
  parse(
    workbook: ParsedWorkbook,
    detection: ParserDetection
  ): ParserResult;
};

export type WorksheetAnalysis = {
  worksheet: ParsedWorksheet;
  populatedCells: WorkbookCell[];
  textCells: WorkbookCell[];
  numericCells: WorkbookCell[];
  dateLikeCells: WorkbookCell[];
  yearCells: WorkbookCell[];
  yachtNameCandidates: WorkbookCell[];
  bookingCodeCandidates: WorkbookCell[];
};