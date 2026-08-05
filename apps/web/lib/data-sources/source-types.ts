import type {
  ParsedWorkbook,
  ParsedWorksheet,
  WorkbookCell,
  WorkbookCellFill,
  WorkbookMerge,
  SerializableCellValue,
} from "./workbook-parser";

export type SourceType =
  | "google_sheets"
  | "dropbox_excel"
  | "website";

export type SourceRecord = {
  id: string;
  company_id: string;
  name: string;
  source_type: SourceType;
  source_url: string | null;
  configuration: Record<string, unknown> | null;
};

export type WorkbookConnectorResult = {
  kind: "workbook";
  sourceType:
    | "google_sheets"
    | "dropbox_excel"
    | "website";
  fileName: string | null;
  workbook: ParsedWorkbook;
};

export type WebsiteConnectorResult = {
  kind: "website";
  sourceType: "website";
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  links: string[];
  jsonLd: unknown[];
};

export type ConnectorResult =
  | WorkbookConnectorResult
  | WebsiteConnectorResult;

export type {
  ParsedWorkbook,
  ParsedWorksheet,
  WorkbookCell,
  WorkbookCellFill,
  WorkbookMerge,
  SerializableCellValue,
};