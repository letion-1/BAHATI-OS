"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
};

export async function login(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const fullName = readString(
    formData.get("fullName")
  );

  const displayRole = readString(
    formData.get("role")
  );

  const email = readString(
    formData.get("email")
  ).toLowerCase();

  const password = readString(
    formData.get("password")
  );

  const nextPath = normalizeNextPath(
    formData.get("next")
  );

  if (fullName.length < 2) {
    return {
      status: "error",
      message: "Enter your full name.",
    };
  }

  if (displayRole.length < 2) {
    return {
      status: "error",
      message:
        "Enter your role, for example Charter Broker or Operations Manager.",
    };
  }

  if (!isValidEmail(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if (password.length < 6) {
    return {
      status: "error",
      message: "Enter your account password.",
    };
  }

  const supabase = await createClient();

  const { error: signInError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError) {
    console.error(
      "Supabase sign-in failed:",
      signInError.message
    );

    return {
      status: "error",
      message:
        signInError.status === 429
          ? "Too many sign-in attempts. Wait a moment and try again."
          : "The email or password is incorrect.",
    };
  }

  const { error: metadataError } =
    await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        display_name: fullName,
        role_title: displayRole,
      },
    });

  if (metadataError) {
    console.error(
      "Could not update account metadata:",
      metadataError.message
    );

    return {
      status: "error",
      message:
        "You were signed in, but your profile could not be updated. Try again.",
    };
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

function readString(
  value: FormDataEntryValue | null
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function normalizeNextPath(
  value: FormDataEntryValue | null
) {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login")
  ) {
    return value;
  }

  return "/";
}