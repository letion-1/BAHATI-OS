import Link from "next/link";

export default function NewInquiryPage() {
  return (
    <div className="mx-auto max-w-5xl py-12">

      <h1 className="text-4xl font-bold">
        New Inquiry
      </h1>

      <p className="mt-2 text-muted-foreground">
        Choose how you'd like to create a new inquiry.
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-2">

        <Link
          href="/inquiries/new/ai"
          className="rounded-xl border p-8 transition hover:shadow-lg hover:border-black"
        >
          <div className="text-5xl">
              🤖
          </div>

          <h2 className="mt-6 text-2xl font-semibold">
              AI Import
          </h2>

          <p className="mt-3 text-muted-foreground">
            Paste an email,
            WhatsApp message,
            or website inquiry.

            Our AI extracts all booking information automatically.
          </p>

          <div className="mt-8 font-medium">
              Start AI Import →
          </div>

        </Link>

        <Link
          href="/inquiries/new/manual"
          className="rounded-xl border p-8 transition hover:shadow-lg hover:border-black"
        >
          <div className="text-5xl">
              ✍️
          </div>

          <h2 className="mt-6 text-2xl font-semibold">
              Manual Entry
          </h2>

          <p className="mt-3 text-muted-foreground">
            Create a new inquiry
            by entering the information yourself.
          </p>

          <div className="mt-8 font-medium">
              Continue →
          </div>

        </Link>

      </div>

    </div>
  );
}