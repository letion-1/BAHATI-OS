import { NextResponse } from "next/server";

import { extractInquiry } from "@/lib/ai/extract-inquiry";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      inquiryText?: unknown;
    };

    if (
      typeof body.inquiryText !== "string" ||
      body.inquiryText.trim().length < 20
    ) {
      return NextResponse.json(
        {
          error: "Please provide a valid inquiry message.",
        },
        {
          status: 400,
        }
      );
    }

    const extractedInquiry = await extractInquiry(
      body.inquiryText.trim()
    );

    return NextResponse.json(
      {
        data: extractedInquiry,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error("Inquiry extraction failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract inquiry.",
      },
      {
        status: 500,
      }
    );
  }
}