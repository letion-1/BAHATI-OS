import { parseWorkbook } from "../workbook-parser";
import type { WorkbookConnectorResult } from "../source-types";

function extractSpreadsheetId(
  sourceUrl: string
): string {
  const match = sourceUrl.match(
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  if (!match?.[1]) {
    throw new Error(
      "Invalid Google Sheets URL."
    );
  }

  return match[1];
}

export async function fetchGoogleSheets(
  sourceUrl: string
): Promise<WorkbookConnectorResult> {
  const spreadsheetId =
    extractSpreadsheetId(sourceUrl);

  const exportUrl =
    `https://docs.google.com/spreadsheets/d/` +
    `${spreadsheetId}/export?format=xlsx`;

  const response = await fetch(
    exportUrl,
    {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google Sheets export failed with status ${response.status}.`
    );
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.toLowerCase() ?? "";

  if (
    contentType.includes("text/html") ||
    contentType.includes(
      "application/json"
    )
  ) {
    throw new Error(
      "Google returned a webpage instead of an XLSX file. " +
        "Confirm that the spreadsheet is publicly accessible."
    );
  }

  const workbookBuffer =
    await response.arrayBuffer();

  const workbook = parseWorkbook(
    workbookBuffer
  );

  return {
    kind: "workbook",
    sourceType: "google_sheets",
    fileName: `${spreadsheetId}.xlsx`,
    workbook,
  };
}