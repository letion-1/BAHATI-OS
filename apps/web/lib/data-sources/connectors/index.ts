import type {
  ConnectorResult,
  SourceRecord,
} from "../source-types";

import { fetchDropboxExcel } from "./dropbox-excel";
import { fetchGoogleSheets } from "./google-sheets";
import { fetchPdfSource } from "./pdf";
import { fetchWebsiteSource } from "./website";

export async function fetchDataSource(
  source: SourceRecord
): Promise<ConnectorResult> {
  const sourceUrl = source.source_url?.trim();

  if (!sourceUrl) {
    throw new Error(
      "The data source does not have a source URL."
    );
  }

  switch (source.source_type) {
    case "google_sheets":
      return fetchGoogleSheets(sourceUrl);

    case "dropbox_excel":
      return fetchDropboxExcel(sourceUrl);

    case "website":
      return fetchWebsiteSource(sourceUrl);

    case "pdf":
      return fetchPdfSource(sourceUrl);

    default: {
      const unsupportedSourceType: never =
        source.source_type;

      throw new Error(
        `Unsupported source type: ${unsupportedSourceType}`
      );
    }
  }
}