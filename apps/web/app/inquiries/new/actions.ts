"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

export async function createInquiry(formData: FormData) {
  const supabase = await createClient();

  const clientName = optionalText(formData.get("client_name"));
  const email = optionalText(formData.get("email"));
  const destination = optionalText(formData.get("destination"));
  const originalInquiry = optionalText(formData.get("original_inquiry"));

  if (!clientName) {
    throw new Error("Client name is required.");
  }

  if (!originalInquiry) {
    throw new Error("Original inquiry is required.");
  }

  const reference = `INQ-${Date.now().toString().slice(-6)}`;

  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      reference,
      client_name: clientName,
      client_type:
        optionalText(formData.get("client_type")) ?? "New charter client",
      email,
      phone: optionalText(formData.get("phone")),
      destination,
      start_date: optionalText(formData.get("start_date")),
      end_date: optionalText(formData.get("end_date")),
      guests: optionalNumber(formData.get("guests")),
      budget_min: optionalNumber(formData.get("budget_min")),
      budget_max: optionalNumber(formData.get("budget_max")),
      currency: optionalText(formData.get("currency")) ?? "EUR",
      preferences: optionalText(formData.get("preferences")),
      original_inquiry: originalInquiry,
      source: optionalText(formData.get("source")) ?? "Manual entry",
      status: "New",
      extraction_confidence: null,
      close_probability: null,
      missing_information: [],
      suggested_question: null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inquiries");
  redirect(`/workspace/inquiry/${data.id}`);
}