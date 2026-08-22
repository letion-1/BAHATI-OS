"use client";

import {
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { SectionHeader } from "@/components/ui/section-header";

type YachtProfilePayload = {
  success: boolean;
  yacht?: {
    id: string;
    name: string;
    rates: {
      currency: string;
    };
    profile: {
      description: string | null;
      yachtType: string | null;
      builder: string | null;
      model: string | null;
      buildYear: number | null;
      lengthMeters: number | null;
      beamMeters: number | null;
      draftMeters: number | null;
      cruisingSpeedKnots: number | null;
      fuelConsumptionLph: number | null;
      flag: string | null;
      guestCapacity: number | null;
      sleepingGuests: number | null;
      cabinCount: number | null;
      crewCount: number | null;
      homePort: string | null;
      cruisingRegions: string[];
      lowSeasonRate: number | null;
      highSeasonRate: number | null;
      standardRateCurrency: string;
      defaultApaPercent: number | null;
    };
    media: {
      heroImageUrl: string | null;
      heroImageId: string | null;
      images: Array<{
        id: string;
        url: string;
        category: string;
        isHero: boolean;
        position: number;
        altText: string | null;
      }>;
    };
    toys: Array<{
      id: string;
      name: string;
      position: number;
    }>;
    cabinConfiguration: Array<{
      id: string;
      type: string;
      count: number;
      position: number;
    }>;
  };
  error?: string;
};

type Draft = {
  name: string;
  description: string;
  yachtType: string;
  builder: string;
  model: string;
  buildYear: string;
  lengthMeters: string;
  beamMeters: string;
  draftMeters: string;
  cruisingSpeedKnots: string;
  fuelConsumptionLph: string;
  flag: string;
  guestCapacity: string;
  sleepingGuests: string;
  cabinCount: string;
  crewCount: string;
  homePort: string;
  cruisingRegions: string;
  lowSeasonRate: string;
  highSeasonRate: string;
  standardRateCurrency: string;
  defaultApaPercent: string;
  toys: string;
  cabins: Array<{ type: string; count: string }>;
};

const categories = [
  ["exterior", "Exterior"],
  ["interior", "Interior"],
  ["saloon", "Saloon"],
  ["master_cabin", "Master Cabin"],
  ["guest_cabin", "Guest Cabin"],
  ["dining", "Dining"],
  ["sundeck", "Sundeck"],
  ["beach_club", "Beach Club"],
  ["water_toys", "Water Toys"],
  ["tender", "Tender"],
  ["layout", "Layout"],
  ["other", "Other"],
] as const;

export function YachtProfileManager({
  yachtId,
  onUpdated,
}: {
  yachtId: string;
  onUpdated?: () => void;
}) {
  const [data, setData] = useState<YachtProfilePayload["yacht"] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [mediaActionId, setMediaActionId] = useState<string | null>(null);
  const [galleryCategory, setGalleryCategory] = useState("other");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}`,
        { cache: "no-store" }
      );
      const result = (await response.json()) as YachtProfilePayload;

      if (!response.ok || !result.success || !result.yacht) {
        throw new Error(result.error ?? "Could not load yacht profile.");
      }

      setData(result.yacht);
      if (!isEditing) {
        setDraft(createDraft(result.yacht));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load yacht profile."
      );
    } finally {
      setIsLoading(false);
    }
  }, [yachtId, isEditing]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing() {
    if (!data) return;
    setDraft(createDraft(data));
    setMessage(null);
    setIsEditing(true);
  }

  function stopEditing() {
    if (data) setDraft(createDraft(data));
    setIsEditing(false);
    setMessage(null);
  }

  async function save() {
    if (!draft) return;

    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);

      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            description: draft.description,
            yachtType: draft.yachtType,
            builder: draft.builder,
            model: draft.model,
            buildYear: blank(draft.buildYear),
            lengthMeters: blank(draft.lengthMeters),
            beamMeters: blank(draft.beamMeters),
            draftMeters: blank(draft.draftMeters),
            cruisingSpeedKnots: blank(draft.cruisingSpeedKnots),
            fuelConsumptionLph: blank(draft.fuelConsumptionLph),
            flag: draft.flag,
            guestCapacity: blank(draft.guestCapacity),
            sleepingGuests: blank(draft.sleepingGuests),
            cabinCount: blank(draft.cabinCount),
            crewCount: blank(draft.crewCount),
            homePort: draft.homePort,
            cruisingRegions: draft.cruisingRegions
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            lowSeasonRate: blank(draft.lowSeasonRate),
            highSeasonRate: blank(draft.highSeasonRate),
            standardRateCurrency:
              draft.standardRateCurrency.trim().toUpperCase() || "EUR",
            defaultApaPercent: blank(draft.defaultApaPercent),
            toys: draft.toys
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
            cabinConfiguration: draft.cabins
              .map((item) => ({
                type: item.type.trim(),
                count: blank(item.count),
              }))
              .filter((item) => item.type && item.count !== null),
          }),
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not save yacht profile.");
      }

      setIsEditing(false);
      setMessage("Yacht profile updated.");
      await load();
      onUpdated?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save yacht profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadHero(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    try {
      setIsUploadingHero(true);
      setError(null);
      const formData = new FormData();
      formData.set("kind", "hero");
      formData.set("category", "exterior");
      formData.set("file", file);

      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}/media`,
        { method: "POST", body: formData }
      );
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not upload hero image.");
      }

      setMessage("Hero image updated.");
      await load();
      onUpdated?.();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload hero image."
      );
    } finally {
      setIsUploadingHero(false);
    }
  }

  async function uploadGallery(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
      setIsUploadingGallery(true);
      setError(null);
      const formData = new FormData();
      formData.set("kind", "gallery");
      formData.set("category", galleryCategory);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}/media`,
        { method: "POST", body: formData }
      );
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not upload gallery images.");
      }

      setMessage("Gallery images added.");
      await load();
      onUpdated?.();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload gallery images."
      );
    } finally {
      setIsUploadingGallery(false);
    }
  }

  async function updateImage(
    imageId: string,
    payload: Record<string, unknown>
  ) {
    try {
      setMediaActionId(imageId);
      setError(null);
      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}/media/${encodeURIComponent(
          imageId
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not update yacht image.");
      }
      await load();
      onUpdated?.();
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Could not update yacht image."
      );
    } finally {
      setMediaActionId(null);
    }
  }

  async function removeImage(imageId: string) {
    try {
      setMediaActionId(imageId);
      setError(null);
      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}/media/${encodeURIComponent(
          imageId
        )}`,
        { method: "DELETE" }
      );
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not delete yacht image.");
      }
      await load();
      onUpdated?.();
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Could not delete yacht image."
      );
    } finally {
      setMediaActionId(null);
    }
  }

  if (isLoading) {
    return (
      <section className="ui-panel animate-pulse rounded-[24px] p-6">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="mt-5 h-72 rounded-[20px] bg-muted" />
      </section>
    );
  }

  if (!data || !draft) {
    return (
      <section className="ui-panel rounded-[24px] p-6">
        <p className="font-semibold text-foreground">Yacht presentation profile</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? "The optional presentation profile could not be loaded."}
        </p>
      </section>
    );
  }

  const profile = data.profile;
  const progress = presentationProgress(data);

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      <section className="ui-panel rounded-[24px] p-5 sm:p-6">
        <SectionHeader
          title="Yacht media"
          subtitle="Optional client-facing photography. If nothing is uploaded, Bahari OS keeps using its existing placeholders."
          action={
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Optional
            </span>
          }
          className="mb-6"
        />

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
              Hero image
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The primary image used across Bahari OS and client proposals.
            </p>

            <div className="relative mt-4 flex min-h-72 items-center justify-center overflow-hidden rounded-[22px] border border-border bg-muted/30">
              {data.media.heroImageUrl ? (
                <img
                  src={data.media.heroImageUrl}
                  alt={`${data.name} hero`}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <YachtPlaceholder />
              )}
              <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                Hero
              </span>
            </div>

            <input
              ref={heroInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={uploadHero}
            />
            <button
              type="button"
              onClick={() => heroInputRef.current?.click()}
              disabled={isUploadingHero}
              className="ui-primary-button mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-60"
            >
              <Upload className="size-4" />
              {isUploadingHero
                ? "Uploading hero..."
                : data.media.heroImageUrl
                  ? "Replace hero image"
                  : "Upload hero image"}
            </button>
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                  Gallery images
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  All other yacht photography, grouped by category.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={galleryCategory}
                  onChange={(event) => setGalleryCategory(event.target.value)}
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                >
                  {categories.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={uploadGallery}
                />
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isUploadingGallery}
                  className="ui-secondary-button inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-60"
                >
                  <ImagePlus className="size-4" />
                  {isUploadingGallery ? "Uploading..." : "Add gallery images"}
                </button>
              </div>
            </div>

            {data.media.images.length === 0 ? (
              <div className="mt-4 flex min-h-72 flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-muted/20 px-6 text-center">
                <YachtPlaceholder compact />
                <p className="mt-4 font-semibold text-foreground">
                  No gallery images uploaded
                </p>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Nothing is required. Bahari OS will keep its existing placeholders until the broker adds photography.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.media.images.map((image) => (
                  <article
                    key={image.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      <img
                        src={image.url}
                        alt={image.altText ?? data.name}
                        className="absolute inset-0 size-full object-cover"
                      />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        {image.isHero ? (
                          <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                            Hero
                          </span>
                        ) : null}
                        <span className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md">
                          {humanize(image.category)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <select
                        value={image.category}
                        disabled={mediaActionId === image.id}
                        onChange={(event) =>
                          void updateImage(image.id, {
                            category: event.target.value,
                          })
                        }
                        className="ui-input h-10 w-full rounded-xl px-3 text-xs"
                      >
                        {categories.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={image.isHero || mediaActionId === image.id}
                          onClick={() =>
                            void updateImage(image.id, { isHero: true })
                          }
                          className="ui-secondary-button inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs font-semibold disabled:opacity-45"
                        >
                          <Star className="size-3.5" />
                          {image.isHero ? "Hero" : "Set as hero"}
                        </button>
                        <button
                          type="button"
                          disabled={mediaActionId === image.id}
                          onClick={() => void removeImage(image.id)}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 text-xs font-semibold text-red-700 dark:text-red-200"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ui-panel rounded-[24px] p-5 sm:p-6">
        <SectionHeader
          title="Client presentation profile"
          subtitle="Optional yacht information shown in proposals only when it is available."
          action={
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {progress}% complete · optional
              </span>
              {!isEditing ? (
                <button
                  type="button"
                  onClick={startEditing}
                  className="ui-secondary-button inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs font-semibold"
                >
                  <Pencil className="size-3.5" />
                  Edit yacht
                </button>
              ) : null}
            </div>
          }
          className="mb-6"
        />

        {isEditing ? (
          <div className="space-y-7">
            <EditorGroup title="Description">
              <InputField
                label="Yacht name"
                value={draft.name}
                onChange={(value) => setDraft({ ...draft, name: value })}
              />
              <label className="sm:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Description
                </span>
                <textarea
                  rows={7}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  className="ui-input w-full rounded-xl px-3 py-3 text-sm leading-6"
                  placeholder="Optional client-facing description..."
                />
              </label>
            </EditorGroup>

            <EditorGroup title="Basic information">
              <InputField label="Yacht type" value={draft.yachtType} onChange={(value) => setDraft({ ...draft, yachtType: value })} />
              <InputField label="Builder" value={draft.builder} onChange={(value) => setDraft({ ...draft, builder: value })} />
              <InputField label="Model" value={draft.model} onChange={(value) => setDraft({ ...draft, model: value })} />
              <InputField label="Built" value={draft.buildYear} onChange={(value) => setDraft({ ...draft, buildYear: value })} />
              <InputField label="Length (m)" value={draft.lengthMeters} onChange={(value) => setDraft({ ...draft, lengthMeters: value })} />
              <InputField label="Beam (m)" value={draft.beamMeters} onChange={(value) => setDraft({ ...draft, beamMeters: value })} />
              <InputField label="Draft (m)" value={draft.draftMeters} onChange={(value) => setDraft({ ...draft, draftMeters: value })} />
              <InputField label="Cruising speed (kn)" value={draft.cruisingSpeedKnots} onChange={(value) => setDraft({ ...draft, cruisingSpeedKnots: value })} />
              <InputField label="Fuel consumption (L/h)" value={draft.fuelConsumptionLph} onChange={(value) => setDraft({ ...draft, fuelConsumptionLph: value })} />
              <InputField label="Flag" value={draft.flag} onChange={(value) => setDraft({ ...draft, flag: value })} />
              <InputField label="Home port" value={draft.homePort} onChange={(value) => setDraft({ ...draft, homePort: value })} />
              <InputField label="Cruising regions" value={draft.cruisingRegions} onChange={(value) => setDraft({ ...draft, cruisingRegions: value })} placeholder="Croatia, Greece, Italy" />
            </EditorGroup>

            <EditorGroup title="Accommodation & crew">
              <InputField label="Guests" value={draft.guestCapacity} onChange={(value) => setDraft({ ...draft, guestCapacity: value })} />
              <InputField label="Guests sleeping" value={draft.sleepingGuests} onChange={(value) => setDraft({ ...draft, sleepingGuests: value })} />
              <InputField label="Cabins" value={draft.cabinCount} onChange={(value) => setDraft({ ...draft, cabinCount: value })} />
              <InputField label="Crew" value={draft.crewCount} onChange={(value) => setDraft({ ...draft, crewCount: value })} />

              <div className="sm:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Cabin configuration</p>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        cabins: [...draft.cabins, { type: "", count: "1" }],
                      })
                    }
                    className="ui-secondary-button inline-flex min-h-9 items-center justify-center gap-2 px-3 text-xs font-semibold"
                  >
                    <Plus className="size-3.5" /> Add cabin type
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.cabins.map((cabin, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_42px]">
                      <input
                        value={cabin.type}
                        onChange={(event) => {
                          const cabins = [...draft.cabins];
                          cabins[index] = { ...cabins[index], type: event.target.value };
                          setDraft({ ...draft, cabins });
                        }}
                        className="ui-input min-h-10 rounded-xl px-3 text-sm"
                        placeholder="Master / VIP / Double / Twin"
                      />
                      <input
                        value={cabin.count}
                        onChange={(event) => {
                          const cabins = [...draft.cabins];
                          cabins[index] = { ...cabins[index], count: event.target.value };
                          setDraft({ ...draft, cabins });
                        }}
                        className="ui-input min-h-10 rounded-xl px-3 text-sm"
                        placeholder="Count"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            cabins: draft.cabins.filter((_, i) => i !== index),
                          })
                        }
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-500/20 text-red-700 dark:text-red-200"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </EditorGroup>

            <EditorGroup title="Tenders & toys">
              <label className="sm:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  One item per line
                </span>
                <textarea
                  rows={7}
                  value={draft.toys}
                  onChange={(event) => setDraft({ ...draft, toys: event.target.value })}
                  className="ui-input w-full rounded-xl px-3 py-3 text-sm leading-6"
                  placeholder={"Jet Skis\nSea Bobs\nWater Skis\nSnorkel Gear\nTender"}
                />
              </label>
            </EditorGroup>

            <EditorGroup title="Standard rates">
              <InputField label="Low season / week" value={draft.lowSeasonRate} onChange={(value) => setDraft({ ...draft, lowSeasonRate: value })} />
              <InputField label="High season / week" value={draft.highSeasonRate} onChange={(value) => setDraft({ ...draft, highSeasonRate: value })} />
              <InputField label="Currency" value={draft.standardRateCurrency} onChange={(value) => setDraft({ ...draft, standardRateCurrency: value.toUpperCase() })} placeholder="EUR" />
              <InputField label="Default APA %" value={draft.defaultApaPercent} onChange={(value) => setDraft({ ...draft, defaultApaPercent: value })} />
            </EditorGroup>

            <div className="flex justify-end gap-2 border-t border-border pt-5">
              <button type="button" onClick={stopEditing} disabled={isSaving} className="ui-secondary-button inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-50">
                <X className="size-4" /> Cancel
              </button>
              <button type="button" onClick={() => void save()} disabled={isSaving} className="ui-primary-button inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold disabled:opacity-60">
                <Save className="size-4" /> {isSaving ? "Saving..." : "Save yacht profile"}
              </button>
            </div>
          </div>
        ) : (
          <ProfileSummary data={data} />
        )}
      </section>
    </div>
  );
}

function ProfileSummary({ data }: { data: NonNullable<YachtProfilePayload["yacht"]> }) {
  const p = data.profile;
  const basic = [
    ["Type", p.yachtType],
    ["Builder", p.builder],
    ["Model", p.model],
    ["Built", p.buildYear],
    ["Length", p.lengthMeters !== null ? `${p.lengthMeters} m` : null],
    ["Beam", p.beamMeters !== null ? `${p.beamMeters} m` : null],
    ["Draft", p.draftMeters !== null ? `${p.draftMeters} m` : null],
    ["Speed", p.cruisingSpeedKnots !== null ? `${p.cruisingSpeedKnots} kn` : null],
    ["Consumption", p.fuelConsumptionLph !== null ? `${p.fuelConsumptionLph} L/h` : null],
    ["Flag", p.flag],
    ["Home port", p.homePort],
  ].filter(([, value]) => value !== null && value !== "");

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SummaryBox title="Description">
        {p.description ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">{p.description}</p>
        ) : (
          <OptionalEmpty>No description added.</OptionalEmpty>
        )}
      </SummaryBox>

      <SummaryBox title="Basic information">
        {basic.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {basic.map(([label, value]) => (
              <Metric key={String(label)} label={String(label)} value={String(value)} />
            ))}
          </div>
        ) : (
          <OptionalEmpty>No additional specifications added.</OptionalEmpty>
        )}
      </SummaryBox>

      <SummaryBox title="Accommodation & crew">
        <div className="grid gap-2 sm:grid-cols-2">
          <Metric label="Guests" value={p.guestCapacity ?? "Not set"} />
          <Metric label="Guests sleeping" value={p.sleepingGuests ?? "Not set"} />
          <Metric label="Cabins" value={p.cabinCount ?? "Not set"} />
          <Metric label="Crew" value={p.crewCount ?? "Not set"} />
        </div>
        {data.cabinConfiguration.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.cabinConfiguration.map((cabin) => (
              <span key={cabin.id} className="rounded-full border border-border bg-background/45 px-3 py-1.5 text-xs font-semibold">
                {cabin.count} {cabin.type}
              </span>
            ))}
          </div>
        ) : null}
      </SummaryBox>

      <SummaryBox title="Tenders & toys">
        {data.toys.length ? (
          <div className="flex flex-wrap gap-2">
            {data.toys.map((toy) => (
              <span key={toy.id} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:text-cyan-200">
                {toy.name}
              </span>
            ))}
          </div>
        ) : (
          <OptionalEmpty>No tenders or toys added.</OptionalEmpty>
        )}
      </SummaryBox>

      <div className="xl:col-span-2">
        <SummaryBox title="Standard rates">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Low season" value={formatRate(p.lowSeasonRate, p.standardRateCurrency)} />
            <Metric label="High season" value={formatRate(p.highSeasonRate, p.standardRateCurrency)} />
            <Metric label="Currency" value={p.standardRateCurrency || "EUR"} />
            <Metric label="Default APA" value={p.defaultApaPercent !== null ? `${p.defaultApaPercent}%` : "Not set"} />
          </div>
        </SummaryBox>
      </div>
    </div>
  );
}

function EditorGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-4 font-semibold text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="ui-input min-h-11 w-full rounded-xl px-3 text-sm" />
    </label>
  );
}

function SummaryBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui-panel-soft rounded-2xl p-5">
      <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background/45 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function OptionalEmpty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{children}</div>;
}

function YachtPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <svg viewBox="0 0 300 140" fill="none" className={`${compact ? "h-20 w-40" : "h-36 w-72"} text-sky-300`} aria-hidden="true">
      <path d="M32 93h232l-22 28H62L32 93Z" stroke="currentColor" strokeWidth="3" />
      <path d="M82 93V51h105l44 42" stroke="currentColor" strokeWidth="3" />
      <path d="M110 51V26h52v25" stroke="currentColor" strokeWidth="3" />
      <path d="M0 130c32-9 53-9 85 0 32 9 53 9 85 0 32-9 53-9 85 0 16 5 29 6 45 4" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function createDraft(data: NonNullable<YachtProfilePayload["yacht"]>): Draft {
  const p = data.profile;
  const n = (value: number | null) => (value === null ? "" : String(value));
  return {
    name: data.name,
    description: p.description ?? "",
    yachtType: p.yachtType ?? "",
    builder: p.builder ?? "",
    model: p.model ?? "",
    buildYear: n(p.buildYear),
    lengthMeters: n(p.lengthMeters),
    beamMeters: n(p.beamMeters),
    draftMeters: n(p.draftMeters),
    cruisingSpeedKnots: n(p.cruisingSpeedKnots),
    fuelConsumptionLph: n(p.fuelConsumptionLph),
    flag: p.flag ?? "",
    guestCapacity: n(p.guestCapacity),
    sleepingGuests: n(p.sleepingGuests),
    cabinCount: n(p.cabinCount),
    crewCount: n(p.crewCount),
    homePort: p.homePort ?? "",
    cruisingRegions: p.cruisingRegions.join(", "),
    lowSeasonRate: n(p.lowSeasonRate),
    highSeasonRate: n(p.highSeasonRate),
    standardRateCurrency: p.standardRateCurrency || data.rates.currency || "EUR",
    defaultApaPercent: n(p.defaultApaPercent),
    toys: data.toys.map((toy) => toy.name).join("\n"),
    cabins: data.cabinConfiguration.map((cabin) => ({ type: cabin.type, count: String(cabin.count) })),
  };
}

function presentationProgress(data: NonNullable<YachtProfilePayload["yacht"]>) {
  const p = data.profile;
  const checks = [
    Boolean(data.media.heroImageUrl),
    data.media.images.length >= 3,
    Boolean(p.description),
    p.lengthMeters !== null,
    Boolean(p.builder),
    p.buildYear !== null,
    p.sleepingGuests !== null || p.guestCapacity !== null,
    p.cabinCount !== null,
    data.toys.length > 0,
    p.lowSeasonRate !== null || p.highSeasonRate !== null,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function blank(value: string): string | null {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRate(amount: number | null, currency: string) {
  if (amount === null) return "Rate on request";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString()}`;
  }
} 