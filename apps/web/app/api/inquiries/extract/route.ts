import { NextResponse } from "next/server";

import { extractInquiry } from "@/lib/ai/extract-inquiry";
import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inquiry extraction is the most expensive endpoint in the application: every
 * call spends an OpenAI request against our own key. It is therefore gated on
 * an authenticated workspace member and rate limited per company.
 */
const RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

const MIN_INPUT_LENGTH = 20;
const MAX_INPUT_LENGTH = 20_000;

export async function POST(request: Request) {
  try {
    // Authenticate first. Nothing expensive happens before this line.
    const workspace = await getCurrentWorkspace();

    const limit = checkRateLimit(
      `inquiries:extract:${workspace.companyId}`,
      RATE_LIMIT
    );

    if (!limit.ok) {
      return NextResponse.json(
        {
          error:
            "Too many extraction requests. Please wait a moment and try again.",
        },
        {
          status: 429,
          headers: rateLimitHeaders(limit),
        }
      );
    }

    const body = (await request.json()) as {
      inquiryText?: unknown;
    };

    if (typeof body.inquiryText !== "string") {
      return NextResponse.json(
        {
          error: "Please provide a valid inquiry message.",
        },
        { status: 400 }
      );
    }

    const inquiryText = body.inquiryText.trim();

    if (inquiryText.length < MIN_INPUT_LENGTH) {
      return NextResponse.json(
        {
          error: "Please provide a valid inquiry message.",
        },
        { status: 400 }
      );
    }

    // Bound the payload so a single request cannot run up an unbounded token
    // bill, and so a pasted mail archive fails fast rather than slowly.
    if (inquiryText.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        {
          error:
            "That message is too long to extract. Please paste the inquiry itself rather than the full thread.",
        },
        { status: 413 }
      );
    }

    const extractedInquiry = await extractInquiry(inquiryText);

    return NextResponse.json(
      {
        data: extractedInquiry,
      },
      {
        status: 200,
        headers: rateLimitHeaders(limit),
      }
    );
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
      return NextResponse.json(
        { error: "You must sign in to continue." },
        { status: error.status }
      );
    }

    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Inquiry extraction failed:", error);

    // Never surface the raw error: upstream provider messages can carry model
    // names, quota detail and occasionally fragments of the prompt.
    return NextResponse.json(
      { error: "Failed to extract inquiry." },
      { status: 500 }
    );
  }
}