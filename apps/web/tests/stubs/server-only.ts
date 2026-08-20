// Test-time stub for Next.js's `server-only` guard.
//
// `server-only` has no runtime implementation; it exists so that `next build`
// fails when a server module is imported into a client bundle. Vitest does not
// run that check, so the import is aliased here to keep server modules
// testable. The real guard is still enforced by the build step in CI.
export {};