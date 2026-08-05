import type {
  NextRequest,
} from "next/server";

import {
  updateSupabaseSession,
} from "./lib/supabase/proxy";

export async function proxy(
  request: NextRequest
) {
  return updateSupabaseSession(
    request
  );
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};