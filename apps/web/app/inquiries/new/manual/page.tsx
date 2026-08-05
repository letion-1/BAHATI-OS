import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Save,
  Ship,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { createInquiry } from "../actions";

const inputClassName =
  "mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/25";

const textareaClassName =
  "mt-2 min-h-32 w-full resize-y rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-white/25";

export default function NewInquiryPage() {
  return (
    <main className="p-6 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <header>
          <Link
            href="/inquiries"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to inquiries
          </Link>

          <div className="mt-5">
            <p className="text-sm font-medium text-zinc-500">
              Charter pipeline
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              New inquiry
            </h1>
            <p className="mt-2 max-w-2xl text-zinc-400">
              Add a charter request manually. The record will be stored in
              Supabase and opened in its workspace.
            </p>
          </div>
        </header>

        <form action={createInquiry} className="mt-8 space-y-6">
          <Card className="border-white/10 bg-zinc-900/60 text-white">
            <CardHeader>
              <CardTitle className="text-base">Client details</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-5 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                Client name <span className="text-red-400">*</span>
                <input
                  name="client_name"
                  required
                  placeholder="Emma Richardson"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                Client type
                <select
                  name="client_type"
                  defaultValue="New charter client"
                  className={inputClassName}
                >
                  <option>New charter client</option>
                  <option>Returning charter client</option>
                  <option>Corporate charter client</option>
                </select>
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-zinc-500" />
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  placeholder="client@example.com"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <Phone className="size-4 text-zinc-500" />
                  Phone
                </span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="+44 20 0000 0000"
                  className={inputClassName}
                />
              </label>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-zinc-900/60 text-white">
            <CardHeader>
              <CardTitle className="text-base">Charter requirements</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-5 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <MapPin className="size-4 text-zinc-500" />
                  Destination
                </span>
                <input
                  name="destination"
                  placeholder="Croatia"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-zinc-500" />
                  Guests
                </span>
                <input
                  name="guests"
                  type="number"
                  min="1"
                  placeholder="8"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-zinc-500" />
                  Start date
                </span>
                <input
                  name="start_date"
                  type="date"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-zinc-500" />
                  End date
                </span>
                <input
                  name="end_date"
                  type="date"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <CircleDollarSign className="size-4 text-zinc-500" />
                  Minimum budget
                </span>
                <input
                  name="budget_min"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="60000"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <CircleDollarSign className="size-4 text-zinc-500" />
                  Maximum budget
                </span>
                <input
                  name="budget_max"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="80000"
                  className={inputClassName}
                />
              </label>

              <label className="text-sm text-zinc-300">
                Currency
                <select
                  name="currency"
                  defaultValue="EUR"
                  className={inputClassName}
                >
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <label className="text-sm text-zinc-300">
                Source
                <select
                  name="source"
                  defaultValue="Manual entry"
                  className={inputClassName}
                >
                  <option>Manual entry</option>
                  <option>Website form</option>
                  <option>Email</option>
                  <option>CRM</option>
                  <option>WhatsApp</option>
                </select>
              </label>

              <label className="text-sm text-zinc-300 md:col-span-2">
                <span className="flex items-center gap-2">
                  <Ship className="size-4 text-zinc-500" />
                  Preferences
                </span>
                <input
                  name="preferences"
                  placeholder="Jacuzzi, Jet Ski, modern interior, family space..."
                  className={inputClassName}
                />
              </label>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-zinc-900/60 text-white">
            <CardHeader>
              <CardTitle className="text-base">Original request</CardTitle>
            </CardHeader>

            <CardContent>
              <label className="text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-zinc-500" />
                  Inquiry message <span className="text-red-400">*</span>
                </span>
                <textarea
                  name="original_inquiry"
                  required
                  placeholder="Paste the client's original email or message here..."
                  className={textareaClassName}
                />
              </label>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
  href="/inquiries"
  className="inline-flex h-10 items-center justify-center rounded-md border border-white/10 bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
>
  Cancel
</Link>

            <Button type="submit">
              <Save className="size-4" />
              Create inquiry
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}