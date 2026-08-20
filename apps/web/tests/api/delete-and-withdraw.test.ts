import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Runtime tests for the delete and withdraw handlers.
 *
 * Typechecking proved these compile. It did not prove they behave, and every
 * bug in this feature so far has been a behaviour bug that compiled fine:
 * a query against a table that does not exist, a guard reading zero rows from
 * an RLS-blocked table and concluding "no blockers", a write reporting success
 * having changed nothing.
 *
 * So these exercise the actual handlers against a stubbed Supabase, asserting
 * on the decisions rather than the types.
 */

const mocks = vi.hoisted(() => ({
  workspace: { companyId: "company-1", userId: "user-1" },
  browser: {} as Record<string, unknown>,
  admin: {} as Record<string, unknown>,
}));

vi.mock("@/lib/workspace/get-current-workspace", () => ({
  getCurrentWorkspace: async () => mocks.workspace,
  isWorkspaceAccessError: () => false,
}));

vi.mock("@/lib/auth/require-user", () => ({
  isAuthenticationRequiredError: () => false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.browser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.admin,
}));

/**
 * Minimal Supabase query-builder stub. Every chained method returns `this`,
 * and the terminal call resolves whatever the table was configured to give.
 */
function makeClient(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null, count: 0 };

      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
        eq: () => builder,
        maybeSingle: async () => result,
        single: async () => result,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result).then(resolve),
      };

      return builder;
    },
  };
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetModules();
});

describe("DELETE /api/inquiries/[id]", () => {
  it("refuses when a charter references the inquiry", async () => {
    mocks.browser = makeClient({
      inquiries: { data: { id: "i1", client_name: "West Anderson" }, error: null },
    });

    // The guard must run as admin: `charters` has RLS enabled with no policy,
    // so the browser client sees zero rows and would wave the delete through.
    mocks.admin = makeClient({
      inquiries: {
        data: {
          proposal_status: "Draft",
          proposal_created_at: "2026-08-18T00:00:00Z",
        },
        error: null,
      },
      charters: { data: [], error: null, count: 1 },
    });

    const { DELETE } = await import("@/app/api/inquiries/[id]/route");
    const response = await DELETE({} as never, context("i1") as never);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/charter/i);
    expect(body.error).toMatch(/proposal/i);
  });

  it("allows deletion of a plain inquiry", async () => {
    mocks.browser = makeClient({
      inquiries: { data: [{ id: "i2" }], error: null },
    });

    mocks.admin = makeClient({
      inquiries: {
        data: { proposal_status: null, proposal_created_at: null },
        error: null,
      },
      charters: { data: [], error: null, count: 0 },
    });

    const { DELETE } = await import("@/app/api/inquiries/[id]/route");
    const response = await DELETE({} as never, context("i2") as never);

    expect(response.status).toBe(200);
  });

  it("reports failure when the delete affects no rows", async () => {
    // A write silently blocked by RLS returns success with an empty result.
    // Reporting that as a successful delete is how a broker ends up believing
    // a record is gone when it is not.
    mocks.browser = {
      from(table: string) {
        const builder: Record<string, unknown> = {
          select: () => builder,
          delete: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({
            data: table === "inquiries" ? { id: "i3", client_name: "X" } : null,
            error: null,
          }),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return builder;
      },
    };

    mocks.admin = makeClient({
      inquiries: {
        data: { proposal_status: null, proposal_created_at: null },
        error: null,
      },
      charters: { data: [], error: null, count: 0 },
    });

    const { DELETE } = await import("@/app/api/inquiries/[id]/route");
    const response = await DELETE({} as never, context("i3") as never);

    expect(response.status).toBe(500);
  });

  it("allows deletion when a status exists but no proposal was ever built", async () => {
    // The real case that broke: an inquiry carrying proposal_status "Draft"
    // with no proposal_created_at. It does not appear in the Proposals list,
    // so telling the broker it has a proposal attached points them at
    // something they cannot find or remove.
    mocks.browser = makeClient({
      inquiries: { data: [{ id: "i4" }], error: null },
    });

    mocks.admin = makeClient({
      inquiries: {
        data: { proposal_status: "Draft", proposal_created_at: null },
        error: null,
      },
      charters: { data: [], error: null, count: 0 },
    });

    const { DELETE } = await import("@/app/api/inquiries/[id]/route");
    const response = await DELETE({} as never, context("i4") as never);

    expect(response.status).toBe(200);
  });

  it("returns 404 for an inquiry in another company", async () => {
    mocks.browser = makeClient({ inquiries: { data: null, error: null } });
    mocks.admin = makeClient({});

    const { DELETE } = await import("@/app/api/inquiries/[id]/route");
    const response = await DELETE({} as never, context("other") as never);

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/proposals/[id] (withdraw)", () => {
  it("clears the proposal and keeps the inquiry", async () => {
    mocks.browser = makeClient({
      inquiries: {
        data: {
          id: "p1",
          client_name: "James",
          proposal_status: "Draft",
          proposal_created_at: "2026-08-18T00:00:00Z",
        },
        error: null,
      },
      proposal_yachts: { data: [], error: null },
    });

    const { DELETE } = await import("@/app/api/proposals/[id]/route");
    const response = await DELETE({} as never, context("p1") as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.previousStatus).toBe("Draft");
  });

  it("withdraws a sent proposal rather than blocking it", async () => {
    mocks.browser = makeClient({
      inquiries: {
        data: {
          id: "p2",
          client_name: "James",
          proposal_status: "Sent",
          proposal_created_at: "2026-08-18T00:00:00Z",
        },
        error: null,
      },
      proposal_yachts: { data: [], error: null },
    });

    const { DELETE } = await import("@/app/api/proposals/[id]/route");
    const response = await DELETE({} as never, context("p2") as never);

    expect(response.status).toBe(200);
  });

  it("refuses when the inquiry has no proposal on it", async () => {
    mocks.browser = makeClient({
      inquiries: {
        data: {
          id: "p3",
          client_name: "Nobody",
          proposal_status: "Draft",
          proposal_created_at: null,
        },
        error: null,
      },
    });

    const { DELETE } = await import("@/app/api/proposals/[id]/route");
    const response = await DELETE({} as never, context("p3") as never);

    expect(response.status).toBe(409);
  });
});