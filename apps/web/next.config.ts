import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * This file was previously empty, which meant the application shipped with no
 * framing protection, no MIME-sniffing protection and no transport security
 * policy. The most exploitable consequence was clickjacking: any site could
 * embed the Bahari OS login form in an invisible frame and capture credentials.
 */

/**
 * Content Security Policy.
 *
 * `unsafe-inline` on script-src is required by Next.js: the framework emits
 * inline bootstrap scripts, and the theme script in app/layout.tsx runs inline
 * to set the colour scheme before first paint and avoid a flash. Removing it
 * needs a nonce-based setup, which is a larger change than this one.
 *
 * `unsafe-eval` is development only. Turbopack's hot reload needs it; it is
 * not present in production builds.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  // Yacht photography and supplier logos are served from Supabase storage and
  // from operator sites, so remote images cannot be restricted to self.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase for data and realtime. OpenAI is called server-side only and so
  // is not listed here.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    // Belt and braces with frame-ancestors above: older browsers honour this
    // header but ignore CSP frame-ancestors.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Stops a browser second-guessing Content-Type, which is how an uploaded
    // file ends up executed as script.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Do not leak the full URL of an internal page to external sites. Proposal
    // and guest portal URLs contain access tokens.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Two years, subdomains included. Only sent over HTTPS, so it has no
    // effect on local development.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // The application needs none of these. Denying them limits what an
    // injected script could reach.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework version.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;