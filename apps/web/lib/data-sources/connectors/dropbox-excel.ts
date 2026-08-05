import { parseWorkbook } from "../workbook-parser";
import type { WorkbookConnectorResult } from "../source-types";

function createDropboxDownloadUrl(
  sourceUrl: string
): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error(
      "Invalid Dropbox URL."
    );
  }

  if (
    !parsedUrl.hostname.includes(
      "dropbox.com"
    )
  ) {
    throw new Error(
      "The supplied URL is not a Dropbox link."
    );
  }

  parsedUrl.searchParams.delete("dl");
  parsedUrl.searchParams.set("dl", "1");

  return parsedUrl.toString();
}

function getDropboxFileName(
  sourceUrl: string
): string | null {
  try {
    const parsedUrl = new URL(sourceUrl);

    const pathParts =
      parsedUrl.pathname
        .split("/")
        .filter(Boolean);

    const possibleFileName =
      pathParts[pathParts.length - 1];

    if (!possibleFileName) {
      return null;
    }

    return decodeURIComponent(
      possibleFileName
    );
  } catch {
    return null;
  }
}

export async function fetchDropboxExcel(
  sourceUrl: string
): Promise<WorkbookConnectorResult> {
  const downloadUrl =
    createDropboxDownloadUrl(sourceUrl);

  const response = await fetch(
    downloadUrl,
    {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Dropbox download failed with status ${response.status}.`
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
      "Dropbox returned a webpage instead of an Excel workbook. " +
        "Confirm that the link allows direct file downloads."
    );
  }

  const workbookBuffer =
    await response.arrayBuffer();

  const workbook = parseWorkbook(
    workbookBuffer
  );

  return {
    kind: "workbook",
    sourceType: "dropbox_excel",
    fileName:
      getDropboxFileName(sourceUrl),
    workbook,
  };
}