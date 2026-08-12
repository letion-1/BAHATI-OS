import { ConfirmEmailClient } from "@/app/auth/confirm/confirm-email-client";

export const dynamic = "force-dynamic";

type ConfirmEmailPageProps = {
  searchParams: Promise<{
    token_hash?: string | string[];
    type?: string | string[];
    next?: string | string[];
  }>;
};

export default async function ConfirmEmailPage({
  searchParams,
}: ConfirmEmailPageProps) {
  const params = await searchParams;

  return (
    <ConfirmEmailClient
      tokenHash={readQueryValue(
        params.token_hash
      )}
      type={
        readQueryValue(params.type) ??
        "email"
      }
      nextPath={normalizeNextPath(
        readQueryValue(params.next)
      )}
    />
  );
}

function readQueryValue(
  value:
    | string
    | string[]
    | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeNextPath(
  value: string | null
) {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login") &&
    !value.startsWith("/sign-up") &&
    !value.startsWith("/auth/") &&
    !value.startsWith("/onboarding")
  ) {
    return value;
  }

  return "/";
}