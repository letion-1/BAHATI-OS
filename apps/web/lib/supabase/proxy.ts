import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/logout",
  "/sign-up",
];

const PUBLIC_ROUTE_PREFIXES = [
  "/auth/",
  "/proposal-review/",
  "/api/public/proposals/",
];

function isPublicRoute(
  pathname: string
): boolean {
  return (
    PUBLIC_ROUTES.includes(
      pathname
    ) ||
    pathname ===
      "/proposal-review" ||
    PUBLIC_ROUTE_PREFIXES.some(
      (prefix) =>
        pathname.startsWith(
          prefix
        )
    )
  );
}

export async function updateSupabaseSession(
  request: NextRequest
) {
  let response =
    NextResponse.next({
      request,
    });

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const pathname =
    request.nextUrl.pathname;

  if (
    !supabaseUrl ||
    !supabaseKey
  ) {
    console.error(
      "Supabase public environment variables are missing."
    );

    /*
     * Do not expose protected pages when authentication
     * cannot be initialized.
     */
    if (
      !isPublicRoute(
        pathname
      )
    ) {
      const loginUrl =
        request.nextUrl.clone();

      loginUrl.pathname =
        "/login";

      loginUrl.searchParams.set(
        "error",
        "authentication_unavailable"
      );

      return NextResponse.redirect(
        loginUrl
      );
    }

    return response;
  }

  const supabase =
    createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet
          ) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value
                );
              }
            );

            response =
              NextResponse.next({
                request,
              });

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options
                );
              }
            );
          },
        },
      }
    );

  let isAuthenticated =
    false;

  try {
    const {
      data,
      error,
    } =
      await supabase.auth.getClaims();

    isAuthenticated =
      !error &&
      Boolean(
        data?.claims?.sub
      );
  } catch (error) {
    console.error(
      "Could not validate Supabase session:",
      error
    );
  }

  const publicRoute =
    isPublicRoute(
      pathname
    );

  if (
    !isAuthenticated &&
    !publicRoute
  ) {
    const loginUrl =
      request.nextUrl.clone();

    loginUrl.pathname =
      "/login";

    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    );

    return NextResponse.redirect(
      loginUrl
    );
  }

  if (
    isAuthenticated &&
    pathname ===
      "/login"
  ) {
    const requestedDestination =
      request.nextUrl.searchParams.get(
        "next"
      );

    const safeDestination =
      requestedDestination?.startsWith(
        "/"
      ) &&
      !requestedDestination.startsWith(
        "//"
      )
        ? requestedDestination
        : "/";

    return NextResponse.redirect(
      new URL(
        safeDestination,
        request.url
      )
    );
  }

  return response;
}