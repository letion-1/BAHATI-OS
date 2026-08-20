#!/usr/bin/env python3
"""Check every Supabase query in the files I wrote against known hazards.

Three failure modes have already bitten in this session:

  1. Querying a table that does not exist ("proposals"), where the error is
     swallowed and the code concludes "no results".
  2. Querying an RLS-enabled table with the browser client, which returns zero
     rows rather than an error, so guards silently pass.
  3. Writing to a table with the browser client when no insert policy exists,
     which reports success while affecting zero rows.

This checks for all three across the files touched in this feature.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# RLS enabled, zero policies defined -> deny-all for the `authenticated` role.
# Any query on these using createClient() silently returns nothing.
RLS_BLOCKED = {
    "charters",
    "charter_concierge_items",
    "charter_guests",
    "charter_itineraries",
    "charter_itinerary_activities",
    "charter_itinerary_days",
    "charter_itinerary_legs",
    "charter_itinerary_shares",
    "charter_payment_schedule",
    "guest_portals",
    "proposal_confirmations",
}

# Tables the code references that do not exist. A proposal is an inquiry row.
NONEXISTENT = {"proposals"}

FILES = [
    "app/api/inquiries/[id]/route.ts",
    "app/api/proposals/[id]/route.ts",
    "app/api/data-sources/pdf/route.ts",
    "app/inquiries/page.tsx",
    "app/proposals/page.tsx",
    "app/inquiries/new/actions.ts",
    "components/inquiries/delete-inquiry-button.tsx",
    "components/proposals/withdraw-proposal-button.tsx",
]

FROM_CALL = re.compile(r'\.from\(\s*["\'](?P<table>\w+)["\']\s*\)')


def which_client(text: str, position: int) -> str:
    """Walk backwards to the nearest client assignment."""
    before = text[:position]

    admin = before.rfind("createAdminClient()")
    user = before.rfind("await createClient()")

    if admin == -1 and user == -1:
        return "unknown"

    return "admin" if admin > user else "browser"


def main() -> int:
    findings = []

    for rel in FILES:
        path = ROOT / rel

        if not path.exists():
            findings.append(("MISSING", rel, 0, "", "file not found"))
            continue

        text = path.read_text(encoding="utf-8")

        for match in FROM_CALL.finditer(text):
            table = match.group("table")
            line = text.count("\n", 0, match.start()) + 1
            client = which_client(text, match.start())

            if table in NONEXISTENT:
                findings.append(
                    ("FATAL", rel, line, table, "table does not exist")
                )
            elif table in RLS_BLOCKED and client != "admin":
                findings.append(
                    (
                        "FATAL",
                        rel,
                        line,
                        table,
                        f"RLS-blocked table via {client} client: returns zero rows silently",
                    )
                )
            elif client == "unknown":
                findings.append(
                    ("CHECK", rel, line, table, "could not determine client")
                )

    print(f"Audited {len(FILES)} files\n")

    if not findings:
        print("No hazards found.")
        print("\nEvery query either targets a table that exists and is")
        print("visible to its client, or uses the admin client for a")
        print("table that RLS would otherwise hide.")
        return 0

    for severity, rel, line, table, reason in findings:
        print(f"{severity}  {rel}:{line}")
        print(f"       table: {table}")
        print(f"       {reason}\n")

    return 1 if any(f[0] == "FATAL" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())