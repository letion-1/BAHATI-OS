import { createClient } from "@/lib/supabase/server";

export default async function DatabaseTestPage() {
  const supabase = await createClient();

  const { data: inquiries, error } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-semibold text-red-400">
          Database connection failed
        </h1>

        <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-zinc-900 p-5 text-sm text-red-300">
          {JSON.stringify(error, null, 2)}
        </pre>
      </main>
    );
  }

  return (
    <main className="p-10">
      <h1 className="text-3xl font-semibold">Supabase connection test</h1>

      <p className="mt-2 text-zinc-500">
        Found {inquiries?.length ?? 0} inquiry record(s).
      </p>

      <pre className="mt-6 overflow-auto rounded-xl border border-white/10 bg-zinc-900 p-5 text-sm text-zinc-300">
        {JSON.stringify(inquiries, null, 2)}
      </pre>
    </main>
  );
}