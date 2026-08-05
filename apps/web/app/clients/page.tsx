"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard as UIStatCard } from "@/components/ui/stat-card";

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  vipLevel: string;
  preferredDestination: string | null;
  preferredYachtType: string | null;
  notes: string | null;
  preferences: Record<string, unknown>;
  lifetimeValue: number;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientsResponse = {
  success: boolean;
  clients?: Client[];
  client?: Client;
  error?: string;
};

type ClientForm = {
  name: string;
  email: string;
  phone: string;
  status: string;
  vipLevel: string;
  preferredDestination: string;
  preferredYachtType: string;
  lifetimeValue: string;
  lastContactedAt: string;
  notes: string;
};

const emptyForm: ClientForm = {
  name: "",
  email: "",
  phone: "",
  status: "active",
  vipLevel: "standard",
  preferredDestination: "",
  preferredYachtType: "",
  lifetimeValue: "0",
  lastContactedAt: "",
  notes: "",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] =
    useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/clients", {
        cache: "no-store",
      });

      const result =
        (await response.json()) as ClientsResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not load clients."
        );
      }

      setClients(result.clients ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load clients."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesStatus =
        statusFilter === "all" ||
        client.status === statusFilter;

      const haystack = [
        client.name,
        client.email,
        client.phone,
        client.preferredDestination,
        client.preferredYachtType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesStatus &&
        (!query || haystack.includes(query))
      );
    });
  }, [clients, search, statusFilter]);

  const stats = useMemo(() => {
    const active = clients.filter(
      (client) => client.status === "active"
    ).length;

    const vip = clients.filter(
      (client) =>
        client.vipLevel === "vip" ||
        client.vipLevel === "ultra"
    ).length;

    const pipelineValue = clients.reduce(
      (total, client) => total + client.lifetimeValue,
      0
    );

    return {
      total: clients.length,
      active,
      vip,
      pipelineValue,
    };
  }, [clients]);

  function openCreateModal() {
    setEditingClient(null);
    setForm(emptyForm);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    setForm({
      name: client.name,
      email: client.email ?? "",
      phone: client.phone ?? "",
      status: client.status,
      vipLevel: client.vipLevel,
      preferredDestination:
        client.preferredDestination ?? "",
      preferredYachtType:
        client.preferredYachtType ?? "",
      lifetimeValue: String(client.lifetimeValue ?? 0),
      lastContactedAt: client.lastContactedAt
        ? client.lastContactedAt.slice(0, 16)
        : "",
      notes: client.notes ?? "",
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  }

  async function submitClient(event: FormEvent) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const endpoint = editingClient
        ? `/api/clients/${editingClient.id}`
        : "/api/clients";

      const response = await fetch(endpoint, {
        method: editingClient ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result =
        (await response.json()) as ClientsResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not save client."
        );
      }

      setSuccess(
        editingClient
          ? "Client updated successfully."
          : "Client created successfully."
      );

      setIsModalOpen(false);
      await loadClients();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save client."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteClient(client: Client) {
    const confirmed = window.confirm(
      `Delete ${client.name}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError(null);

      const response = await fetch(
        `/api/clients/${client.id}`,
        {
          method: "DELETE",
        }
      );

      const result =
        (await response.json()) as ClientsResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not delete client."
        );
      }

      setSuccess("Client deleted.");
      await loadClients();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete client."
      );
    }
  }

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="contents">
        <HeroCard
          eyebrow="Client intelligence"
          title="Luxury client CRM"
          description="Manage client relationships, charter preferences, contact history and commercial value from one private workspace."
          actions={
            <button
              type="button"
              onClick={openCreateModal}
              className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              + New client
            </button>
          }
        />

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-800 dark:text-red-100">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-800 dark:text-emerald-100">
            {success}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UIStatCard
            label="Total clients"
            value={stats.total}
            subtitle="CRM profiles"
            tone="neutral"
          />
          <UIStatCard
            label="Active clients"
            value={stats.active}
            subtitle="Open relationships"
            tone="emerald"
          />
          <UIStatCard
            label="VIP clients"
            value={stats.vip}
            subtitle="Priority accounts"
            tone="violet"
          />
          <UIStatCard
            label="Lifetime value"
            value={formatCurrency(stats.pipelineValue)}
            subtitle="Recorded client value"
            tone="amber"
          />
        </section>

        <section className="ui-panel rounded-[24px] p-5 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
            <label className="relative">
              <span className="sr-only">Search clients</span>
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search client, email, phone or destination..."
                className="h-12 w-full rounded-xl border border-input bg-background/55 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/65 focus:border-sky-400/30"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="ui-input h-12 px-4 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="prospect">Prospect</option>
              <option value="inactive">Inactive</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="h-12 rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </section>

        <SectionHeader
          eyebrow="Relationship directory"
          title="Client results"
          subtitle={`${filteredClients.length} of ${clients.length} clients`}
        />

        {isLoading ? (
          <ClientSkeleton />
        ) : filteredClients.length === 0 ? (
          <EmptyState onCreate={openCreateModal} />
        ) : (
          <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onEdit={() => openEditModal(client)}
                onDelete={() => void deleteClient(client)}
              />
            ))}
          </section>
        )}
      </div>

      {isModalOpen ? (
        <ClientModal
          form={form}
          setForm={setForm}
          isSaving={isSaving}
          isEditing={Boolean(editingClient)}
          onClose={() => setIsModalOpen(false)}
          onSubmit={submitClient}
        />
      ) : null}
    </PageContainer>
  );
}

function ClientCard({
  client,
  onEdit,
  onDelete,
}: {
  client: Client;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="group ui-panel apple-transition rounded-[24px] p-5 hover:-translate-y-0.5 hover:border-ring/25">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-[18px] border border-cyan-500/20 bg-cyan-500/10 text-sm font-semibold text-cyan-800 dark:text-cyan-200">
            {initials(client.name)}
          </div>

          <div className="min-w-0">
            <Link
              href={`/clients/${client.id}`}
              className="truncate font-heading text-3xl leading-none tracking-[0.045em] text-foreground transition hover:text-cyan-700 dark:hover:text-cyan-300"
            >
              {client.name}
            </Link>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {client.email ?? "No email recorded"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge value={client.status} />
          <VipBadge value={client.vipLevel} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric
          label="Destination"
          value={
            client.preferredDestination ?? "Not specified"
          }
        />
        <Metric
          label="Yacht preference"
          value={
            client.preferredYachtType ?? "Not specified"
          }
        />
        <Metric
          label="Lifetime value"
          value={formatCurrency(client.lifetimeValue)}
        />
        <Metric
          label="Last contacted"
          value={formatRelativeTime(
            client.lastContactedAt
          )}
        />
      </div>

      {client.notes ? (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {client.notes}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between border-t border-border/80 pt-4">
        <span className="text-xs text-muted-foreground/65">
          Updated {formatRelativeTime(client.updatedAt)}
        </span>

        <div className="flex gap-2">
          <Link
            href={`/clients/${client.id}`}
            className="ui-primary-button apple-transition rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-90"
          >
            Open profile
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/80 transition hover:bg-accent/70 hover:text-foreground"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-400/15 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/10"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function ClientModal({
  form,
  setForm,
  isSaving,
  isEditing,
  onClose,
  onSubmit,
}: {
  form: ClientForm;
  setForm: (
    value:
      | ClientForm
      | ((current: ClientForm) => ClientForm)
  ) => void;
  isSaving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  function updateField(
    field: keyof ClientForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-10 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-4xl rounded-[28px] border border-border bg-card p-6 shadow-2xl shadow-black/50 sm:p-8"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">
              Client CRM
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">
              {isEditing
                ? "Edit client profile"
                : "Create client profile"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <InputField
            label="Client name"
            required
            value={form.name}
            onChange={(value) =>
              updateField("name", value)
            }
          />
          <InputField
            label="Email"
            type="email"
            value={form.email}
            onChange={(value) =>
              updateField("email", value)
            }
          />
          <InputField
            label="Phone"
            value={form.phone}
            onChange={(value) =>
              updateField("phone", value)
            }
          />
          <SelectField
            label="Relationship status"
            value={form.status}
            options={[
              ["active", "Active"],
              ["prospect", "Prospect"],
              ["inactive", "Inactive"],
            ]}
            onChange={(value) =>
              updateField("status", value)
            }
          />
          <SelectField
            label="Client level"
            value={form.vipLevel}
            options={[
              ["standard", "Standard"],
              ["vip", "VIP"],
              ["ultra", "Ultra VIP"],
            ]}
            onChange={(value) =>
              updateField("vipLevel", value)
            }
          />
          <InputField
            label="Preferred destination"
            value={form.preferredDestination}
            onChange={(value) =>
              updateField(
                "preferredDestination",
                value
              )
            }
          />
          <InputField
            label="Preferred yacht type"
            value={form.preferredYachtType}
            onChange={(value) =>
              updateField(
                "preferredYachtType",
                value
              )
            }
          />
          <InputField
            label="Lifetime value"
            type="number"
            value={form.lifetimeValue}
            onChange={(value) =>
              updateField("lifetimeValue", value)
            }
          />
          <InputField
            label="Last contacted"
            type="datetime-local"
            value={form.lastContactedAt}
            onChange={(value) =>
              updateField(
                "lastContactedAt",
                value
              )
            }
          />
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-foreground/80">
            Broker notes
          </span>
          <textarea
            rows={5}
            value={form.notes}
            onChange={(event) =>
              updateField("notes", event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-input bg-background/55 px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-sky-400/30"
            placeholder="Preferences, charter history, requests, dietary notes, family details..."
          />
        </label>

        <div className="mt-7 flex justify-end gap-3 border-t border-border/80 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? "Saving..."
              : isEditing
                ? "Save changes"
                : "Create client"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InputField({
  label,
  type = "text",
  value,
  required = false,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground/80">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-12 w-full rounded-xl border border-input bg-background/55 px-4 text-sm text-foreground outline-none focus:border-sky-400/30"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground/80">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-12 w-full rounded-xl border border-input bg-background/55 px-4 text-sm text-foreground outline-none focus:border-sky-400/30"
      >
        {options.map(([optionValue, labelText]) => (
          <option
            key={optionValue}
            value={optionValue}
          >
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/10">
      <p className="text-sm text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-4 text-sm text-muted-foreground/80">
        {description}
      </p>
    </article>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-background/45 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/65">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground/80">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const style =
    value === "active"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : value === "prospect"
        ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
        : "border-border bg-accent/60 text-muted-foreground";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${style}`}
    >
      {value}
    </span>
  );
}

function VipBadge({ value }: { value: string }) {
  if (value === "standard") {
    return null;
  }

  return (
    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
      {value === "ultra" ? "Ultra VIP" : "VIP"}
    </span>
  );
}

function EmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-dashed border-border bg-card px-6 py-20 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-sky-400/15 bg-sky-400/10 text-xl text-sky-300">
        ◇
      </div>
      <h2 className="mt-5 text-xl font-semibold">
        No clients found
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Create a private client profile to store contact
        details, preferences, notes and commercial history.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Create first client
      </button>
    </section>
  );
}

function ClientSkeleton() {
  return (
    <section className="grid animate-pulse gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-72 rounded-2xl bg-accent/60"
        />
      ))}
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "EUR",
      notation: value >= 1_000_000 ? "compact" : "standard",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `EUR ${value.toLocaleString("en-GB")}`;
  }
}

function formatRelativeTime(
  value: string | null
): string {
  if (!value) {
    return "Never";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const difference = timestamp - Date.now();
  const absoluteDifference = Math.abs(difference);

  if (absoluteDifference < 60_000) {
    return "Just now";
  }

  const formatter = new Intl.RelativeTimeFormat(
    "en",
    {
      numeric: "auto",
    }
  );

  if (absoluteDifference < 3_600_000) {
    return formatter.format(
      Math.round(difference / 60_000),
      "minute"
    );
  }

  if (absoluteDifference < 86_400_000) {
    return formatter.format(
      Math.round(difference / 3_600_000),
      "hour"
    );
  }

  return formatter.format(
    Math.round(difference / 86_400_000),
    "day"
  );
}