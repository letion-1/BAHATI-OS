"server-only";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let adminClient: SupabaseClient | null =
  null;

export function createAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  validateServiceRoleKey(serviceRoleKey);

  adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "X-Client-Info":
            "intrigue-bahari-os-service-role",
        },
      },
    }
  );

  return adminClient;
}

function validateServiceRoleKey(
  key: string
): void {
  if (key.startsWith("sb_secret_")) {
    return;
  }

  if (
    key.startsWith("sb_publishable_") ||
    key.startsWith("anon")
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY contains a public key. Replace it with the Supabase secret or service_role key."
    );
  }

  const parts = key.split(".");

  if (parts.length !== 3) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase secret or legacy service-role JWT."
    );
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        parts[1],
        "base64url"
      ).toString("utf8")
    ) as {
      role?: string;
    };

    if (payload.role !== "service_role") {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY has role "${payload.role ?? "unknown"}" instead of "service_role".`
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "instead of"
      )
    ) {
      throw error;
    }

    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY could not be validated."
    );
  }
}