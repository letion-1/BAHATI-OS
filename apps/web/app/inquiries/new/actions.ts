"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

/*
 * Note: a "use server" file may only export async functions. The
 * CreateInquiryState type and its initial value therefore live in
 * ./form-state.ts, which is a plain module. `export type` alone would be
 * erased at compile time and would be legal here, but keeping the type beside
 * its initial value is clearer than splitting them across two files.
 */
import type { CreateInquiryState } from "./form-state";

function optionalText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Date inputs submit `yyyy-mm-dd`, but a pasted or autofilled value can be
 * anything. Postgres rejects a malformed date with an opaque error, so the
 * value is validated here instead.
 */
function optionalDate(value: FormDataEntryValue | null) {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export async function createInquiry(
  _previousState: CreateInquiryState,
  formData: FormData
): Promise<CreateInquiryState> {
  let inquiryId: string;

  try {
    // Authorisation happens here. The admin client below then performs the
    // trusted insert, matching how /api/inquiries/create works: the browser
    // client is subject to RLS and is not granted an insert policy.
    const workspace = await getCurrentWorkspace();

    const clientName = optionalText(formData.get("client_name"));
    const originalInquiry = optionalText(formData.get("original_inquiry"));

    if (!clientName) {
      return { error: "Client name is required.", field: "client_name" };
    }

    if (!originalInquiry) {
      return {
        error:
          "Paste the client's original message so the record has context.",
        field: "original_inquiry",
      };
    }

    const startDate = optionalDate(formData.get("start_date"));
    const endDate = optionalDate(formData.get("end_date"));

    if (startDate && endDate && startDate > endDate) {
      return {
        error: "The end date cannot be earlier than the start date.",
        field: "end_date",
      };
    }

    const budgetMin = optionalNumber(formData.get("budget_min"));
    const budgetMax = optionalNumber(formData.get("budget_max"));

    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
      return {
        error: "The maximum budget cannot be lower than the minimum budget.",
        field: "budget_max",
      };
    }

    const admin = createAdminClient();

    const reference = `INQ-${Date.now().toString().slice(-8)}`;

    const { data, error } = await admin
      .from("inquiries")
      .insert({
        company_id: workspace.companyId,
        reference,
        client_name: clientName,
        client_type:
          optionalText(formData.get("client_type")) ?? "New charter client",
        email: optionalText(formData.get("email")),
        phone: optionalText(formData.get("phone")),
        destination: optionalText(formData.get("destination")),
        start_date: startDate,
        end_date: endDate,
        guests: optionalNumber(formData.get("guests")),
        budget_min: budgetMin,
        budget_max: budgetMax,
        currency:
          optionalText(formData.get("currency"))?.toUpperCase() ?? "EUR",
        preferences: optionalText(formData.get("preferences")),
        original_inquiry: originalInquiry,
        source: optionalText(formData.get("source")) ?? "Manual entry",
        // Lowercase to match the AI import path and the status filters on the
        // inquiries list. "New" sorted into its own phantom bucket.
        status: "new",
        extraction_confidence: null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Manual inquiry insert failed:", error);

      return {
        error:
          "Could not save the inquiry. Please try again, and contact support if this keeps happening.",
        field: null,
      };
    }

    inquiryId = data.id as string;
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
      return {
        error: "Your session has expired. Please sign in again.",
        field: null,
      };
    }

    if (isWorkspaceAccessError(error)) {
      return { error: error.message, field: null };
    }

    console.error("Create inquiry action failed:", error);

    return { error: "Something went wrong. Please try again.", field: null };
  }

  // redirect() throws NEXT_REDIRECT by design, so it must sit outside the try
  // block. Inside it, the catch would swallow the redirect and the form would
  // report a failure after a successful save.
  revalidatePath("/inquiries");
  redirect(`/workspace/inquiry/${inquiryId}`);
}