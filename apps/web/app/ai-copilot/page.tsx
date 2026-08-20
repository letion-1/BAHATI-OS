"use client";

import Link from "next/link";
import {
  type FormEvent,
  useState,
} from "react";

type CopilotResult = {
  type:
    | "client"
    | "inquiry"
    | "proposal"
    | "yacht";
  title: string;
  subtitle: string;
  href: string;
};

type CopilotResponse = {
  success: boolean;
  answer?: string;
  results?: CopilotResult[];
  error?: string;
};

const suggestions = [
  "Find yachts under €120000 in Greece",
  "Show me clients interested in Croatia",
  "Which proposals are still drafts?",
  "Show won inquiries",
  "Find yachts for 8 guests",
  "Show the latest inquiries",
];

export default function AiCopilotPage() {
  const [message, setMessage] =
    useState("");

  const [answer, setAnswer] =
    useState("");

  const [results, setResults] =
    useState<CopilotResult[]>([]);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function askCopilot(
    event?: FormEvent<HTMLFormElement>
  ) {
    event?.preventDefault();

    const cleanedMessage =
      message.trim();

    if (!cleanedMessage) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setAnswer("");
      setResults([]);

      const response = await fetch(
        "/api/ai-copilot",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            message: cleanedMessage,
          }),
        }
      );

      const responseText =
        await response.text();

      let result:
        | CopilotResponse
        | null = null;

      if (responseText.trim()) {
        try {
          result = JSON.parse(
            responseText
          ) as CopilotResponse;
        } catch {
          throw new Error(
            `The Copilot returned an invalid response (${response.status}).`
          );
        }
      }

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ??
            `Copilot request failed with status ${response.status}.`
        );
      }

      setAnswer(
        result.answer ??
          "Request completed."
      );

      setResults(
        result.results ?? []
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Copilot request failed."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function applySuggestion(
    suggestion: string
  ) {
    setMessage(suggestion);
    setError(null);
  }

  return (
    <main className="ui-page min-h-full px-5 py-7 sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-violet-400 shadow-[0_0_15px_rgba(167,139,250,0.65)]" />

              <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.26em]">
                Workspace Intelligence
              </p>
            </div>

            <h1 className="mt-5 font-heading text-5xl leading-none tracking-[0.055em] text-[var(--hero-foreground)] sm:text-6xl xl:text-7xl">
              AI Copilot
            </h1>

            <p className="ui-hero-muted mt-3 max-w-3xl text-sm leading-7 sm:text-base">
              Search clients, inquiries,
              proposals and fleet records
              using natural language. Every
              result comes from this workspace.
            </p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="ui-panel rounded-[24px] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
              Ask the workspace
            </p>

            <h2 className="mt-3 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              What do you need?
            </h2>

            <form
              onSubmit={askCopilot}
              className="mt-6"
            >
              <textarea
                value={message}
                onChange={(event) =>
                  setMessage(
                    event.target.value
                  )
                }
                rows={7}
                placeholder="Find yachts under €120000 in Greece..."
                className="ui-input min-h-[210px] resize-none p-4 text-sm leading-7"
              />

              <button
                type="submit"
                disabled={isLoading}
                className="ui-primary-button apple-transition mt-4 w-full px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading
                  ? "Searching workspace..."
                  : "Ask Copilot"}
              </button>
            </form>

            <div className="mt-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Suggested commands
              </p>

              <div className="mt-3 space-y-2">
                {suggestions.map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() =>
                        applySuggestion(
                          suggestion
                        )
                      }
                      className="ui-panel-soft apple-transition w-full rounded-xl px-4 py-3 text-left text-sm leading-6 text-muted-foreground hover:-translate-y-0.5 hover:border-ring/25 hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="ui-panel rounded-[24px] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
                  Grounded response
                </p>

                <h2 className="mt-3 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
                  Copilot results
                </h2>
              </div>

              {results.length > 0 ? (
                <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {results.length} found
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-700 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {!answer &&
            !error &&
            !isLoading ? (
              <div className="ui-panel-soft mt-10 rounded-[22px] border-dashed px-6 py-16 text-center">
                <p className="font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
                  The Copilot is ready
                </p>

                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
                  Ask about yacht availability,
                  client preferences, pipeline
                  status or proposal records.
                </p>
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 space-y-3">
                {Array.from({
                  length: 4,
                }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : null}

            {answer && !isLoading ? (
              <div className="mt-6 rounded-[22px] border border-violet-500/20 bg-violet-500/10 p-5">
                <p className="text-sm leading-7 text-foreground/85">
                  {answer}
                </p>
              </div>
            ) : null}

            {!isLoading ? (
              <div className="mt-5 space-y-3">
                {results.map(
                  (result) => (
                    <Link
                      key={`${result.type}-${result.href}`}
                      href={result.href}
                      className="ui-panel-soft apple-transition block rounded-xl p-4 hover:-translate-y-0.5 hover:border-cyan-500/25"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                            {result.type}
                          </p>

                          <h3 className="mt-2 truncate text-base font-semibold text-foreground">
                            {result.title}
                          </h3>

                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {result.subtitle ||
                              "Open record"}
                          </p>
                        </div>

                        <span className="text-muted-foreground">
                          →
                        </span>
                      </div>
                    </Link>
                  )
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}