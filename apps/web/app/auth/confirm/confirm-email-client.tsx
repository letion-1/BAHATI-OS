"use client";

import {
  Anchor,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import {
  confirmSignup,
  type ConfirmSignupState,
} from "@/app/auth/confirm/actions";

const initialState: ConfirmSignupState = {
  status: "idle",
  message: null,
};

export function ConfirmEmailClient({
  tokenHash,
  type,
  nextPath,
}: {
  tokenHash: string | null;
  type: string;
  nextPath: string;
}) {
  const [state, formAction, isPending] =
    useActionState(
      confirmSignup,
      initialState
    );

  const missingToken =
    !tokenHash || !type;

  return (
    <main className="ui-page relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-15%] top-[-20%] size-[34rem] rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] size-[38rem] rounded-full bg-violet-400/[0.08] blur-3xl" />
      </div>

      <section className="ui-panel relative w-full max-w-xl rounded-[30px] p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Anchor className="size-5" />
          </div>

          <div>
            <p className="font-heading text-2xl leading-none tracking-[0.08em]">
              Intrigue Yacht OS
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Secure account confirmation
            </p>
          </div>
        </div>

        <div className="mt-8 flex size-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-5" />
        </div>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          One final step
        </p>

        <h1 className="mt-2 font-heading text-4xl leading-[1.05] tracking-[0.045em] sm:text-5xl">
          Confirm your Yacht OS account.
        </h1>

        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          For security, opening the email does not activate the account automatically. Confirm below to verify your email, create the company workspace and continue to onboarding.
        </p>

        {missingToken ? (
          <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-4 text-sm leading-6 text-red-700 dark:text-red-200">
            This confirmation link is incomplete. Return to the signup page and request a fresh confirmation email.
          </div>
        ) : (
          <form
            action={formAction}
            className="mt-7"
          >
            <input
              type="hidden"
              name="token_hash"
              value={tokenHash}
            />

            <input
              type="hidden"
              name="type"
              value={type}
            />

            <input
              type="hidden"
              name="next"
              value={nextPath}
            />

            {state.status === "error" &&
            state.message ? (
              <div
                role="alert"
                className="mb-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-4 text-sm leading-6 text-red-700 dark:text-red-200"
              >
                {state.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="ui-primary-button apple-transition inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Confirming account
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Confirm email & continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-5">
          <p className="text-xs leading-5 text-muted-foreground">
            This extra click also prevents email security scanners from consuming your one-time verification before you reach Yacht OS.
          </p>

          <Link
            href="/sign-up"
            className="mt-4 inline-flex text-xs font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Back to signup
          </Link>
        </div>
      </section>
    </main>
  );
}