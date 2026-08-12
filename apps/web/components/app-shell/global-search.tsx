"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

type SearchResult = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

type SearchResponse = {
  success: boolean;
  query?: string;
  results?: SearchResult[];
  warnings?: string[];
  error?: string;
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] =
    useState(false);

  const [query, setQuery] =
    useState("");

  const [results, setResults] =
    useState<SearchResult[]>([]);

  const [warnings, setWarnings] =
    useState<string[]>([]);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const inputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  useEffect(() => {
    function handleShortcut(
      event: KeyboardEvent
    ) {
      const isSearchShortcut =
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() === "k";

      if (isSearchShortcut) {
        event.preventDefault();

        setIsOpen((current) => {
          const nextValue = !current;

          if (!nextValue) {
            setQuery("");
            setResults([]);
            setWarnings([]);
            setError(null);
          }

          return nextValue;
        });
      }

      if (event.key === "Escape") {
        closeSearch();
      }
    }

    window.addEventListener(
      "keydown",
      handleShortcut
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleShortcut
      );
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeout =
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

    return () =>
      window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    const cleanedQuery =
      query.trim();

    if (
      !isOpen ||
      cleanedQuery.length < 2
    ) {
      setResults([]);
      setWarnings([]);
      setError(null);
      setIsLoading(false);

      return;
    }

    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        async () => {
          try {
            setIsLoading(true);
            setError(null);
            setWarnings([]);

            const response =
              await fetch(
                `/api/search?q=${encodeURIComponent(
                  cleanedQuery
                )}`,
                {
                  cache: "no-store",
                  signal:
                    controller.signal,
                }
              );

            const responseText =
              await response.text();

            let result:
              | SearchResponse
              | null = null;

            if (
              responseText.trim()
            ) {
              try {
                result =
                  JSON.parse(
                    responseText
                  ) as SearchResponse;
              } catch {
                throw new Error(
                  `Search returned invalid JSON (${response.status}).`
                );
              }
            }

            if (
              !response.ok ||
              !result?.success
            ) {
              throw new Error(
                result?.error ??
                  `Search failed (${response.status}).`
              );
            }

            setResults(
              result.results ?? []
            );

            setWarnings(
              result.warnings ?? []
            );
          } catch (
            searchError
          ) {
            if (
              searchError instanceof
                DOMException &&
              searchError.name ===
                "AbortError"
            ) {
              return;
            }

            setError(
              searchError instanceof
                Error
                ? searchError.message
                : "Search failed."
            );

            setResults([]);
            setWarnings([]);
          } finally {
            if (
              !controller.signal
                .aborted
            ) {
              setIsLoading(false);
            }
          }
        },
        250
      );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, query]);

  function closeSearch() {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setWarnings([]);
    setError(null);
    setIsLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setIsOpen(true)
        }
        className="hidden size-9 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-white/10 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white sm:inline-flex"
        aria-label="Open global search"
        title="Search (Ctrl+K)"
      >
        <Search className="size-4" />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-foreground/20 px-4 py-16 backdrop-blur-sm dark:bg-black/80 sm:py-20"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeSearch();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            className="ui-panel w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[var(--strong-shadow)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0f16] dark:shadow-2xl dark:shadow-black/60"
          >
            <div className="flex items-center gap-3 border-b border-border p-4 dark:border-white/[0.08]">
              <Search className="size-5 shrink-0 text-muted-foreground dark:text-slate-500" />

              <input
                ref={inputRef}
                value={query}
                onChange={(
                  event
                ) =>
                  setQuery(
                    event.target.value
                  )
                }
                placeholder="Search anything in the workspace..."
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 dark:text-white dark:placeholder:text-slate-700"
                aria-label="Search workspace"
              />

              <div className="hidden rounded-md border border-border bg-background/55 px-2 py-1 text-[10px] font-semibold text-muted-foreground dark:border-white/[0.08] dark:bg-black/20 dark:text-slate-600 sm:block">
                Ctrl K
              </div>

              <button
                type="button"
                onClick={closeSearch}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-white/[0.08] dark:text-slate-500 dark:hover:bg-white/[0.04] dark:hover:text-white"
                aria-label="Close search"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-4">
              {query
                .trim()
                .length < 2 ? (
                <SearchEmptyState />
              ) : null}

              {isLoading ? (
                <SearchSkeleton />
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-700 dark:text-red-100">
                  {error}
                </div>
              ) : null}

              {!isLoading &&
              !error &&
              query
                .trim()
                .length >= 2 &&
              results.length ===
                0 ? (
                <NoResults
                  query={query}
                />
              ) : null}

              {!isLoading &&
              !error &&
              results.length >
                0 ? (
                <div className="space-y-2">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-slate-700">
                      Search results
                    </p>

                    <span className="text-xs text-muted-foreground dark:text-slate-600">
                      {
                        results.length
                      }{" "}
                      found
                    </span>
                  </div>

                  {results.map(
                    (
                      result,
                      index
                    ) => (
                      <SearchResultCard
                        key={`${result.type}-${result.href}-${result.title}-${index}`}
                        result={
                          result
                        }
                        onOpen={
                          closeSearch
                        }
                      />
                    )
                  )}
                </div>
              ) : null}

              {!isLoading &&
              warnings.length >
                0 ? (
                <details className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
                  <summary className="cursor-pointer text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Some sources
                    could not be
                    searched
                  </summary>

                  <div className="mt-3 space-y-2">
                    {warnings.map(
                      (
                        warning,
                        index
                      ) => (
                        <p
                          key={`${warning}-${index}`}
                          className="text-xs leading-5 text-amber-700/80 dark:text-amber-100/60"
                        >
                          {
                            warning
                          }
                        </p>
                      )
                    )}
                  </div>
                </details>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[11px] text-muted-foreground dark:border-white/[0.08] dark:text-slate-700">
              <span>
                Searches all
                available workspace
                records
              </span>

              <span>
                Esc to close
              </span>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function SearchResultCard({
  result,
  onOpen,
}: {
  result: SearchResult;
  onOpen: () => void;
}) {
  return (
    <Link
      href={result.href}
      onClick={onOpen}
      className="group block rounded-xl border border-border bg-background/55 p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-accent/60 dark:border-white/[0.06] dark:bg-black/20 dark:hover:border-sky-400/25 dark:hover:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-sky-400">
            {humanize(
              result.type
            )}
          </p>

          <h3 className="mt-2 truncate text-sm font-semibold text-foreground dark:text-white">
            {result.title}
          </h3>

          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground dark:text-slate-500">
            {result.subtitle ||
              "Open record"}
          </p>
        </div>

        <span className="mt-1 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-cyan-700 dark:text-slate-700 dark:group-hover:text-sky-400">
          →
        </span>
      </div>
    </Link>
  );
}

function SearchEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/45 px-5 py-12 text-center dark:border-white/10 dark:bg-black/20">
      <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-card/70 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <Search className="size-5 text-muted-foreground dark:text-slate-500" />
      </div>

      <p className="mt-4 text-sm font-semibold text-foreground dark:text-slate-300">
        Search the entire OS
      </p>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground dark:text-slate-600">
        Search client names,
        yacht specifications,
        inquiry notes,
        proposal details,
        documents, dates,
        prices, statuses and
        nested data.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {[
          "ABORDA",
          "draft proposal",
          "Croatia",
          "passport",
          "available",
        ].map(
          (suggestion) => (
            <span
              key={suggestion}
              className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-600"
            >
              {suggestion}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function NoResults({
  query,
}: {
  query: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/45 px-5 py-12 text-center dark:border-white/10 dark:bg-black/20">
      <p className="text-sm font-semibold text-foreground dark:text-slate-300">
        No matching records
      </p>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground dark:text-slate-600">
        Nothing matched
        <span className="font-semibold text-foreground/80 dark:text-slate-400">
          {" "}
          “{query.trim()}”
        </span>
        . Try fewer words, part
        of a name, a reference,
        location or status.
      </p>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({
        length: 5,
      }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl bg-muted/70 dark:bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

function humanize(
  value: string
) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (
      character
    ) =>
      character.toUpperCase()
    );
}