import { Suspense } from "react";

import ProposalNewClient from "./proposal-new-client";

function ProposalNewFallback() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <p>Loading proposal workspace…</p>
    </main>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<ProposalNewFallback />}>
      <ProposalNewClient />
    </Suspense>
  );
}