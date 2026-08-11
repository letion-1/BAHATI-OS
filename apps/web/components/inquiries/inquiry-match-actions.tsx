"use client";

import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Clock3,
  KeyRound,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Radio,
  Save,
  ShieldCheck,
  Ship,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

type InquiryMatchInput = {
  id: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  guests: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  preferences: string | null;
};

type YachtRecord = {
  id: string;
  name: string;
  yachtType: string | null;
  builder: string | null;
  model: string | null;
  lengthMeters: number | null;
  guestCapacity: number | null;
  sleepingGuests: number | null;
  cabinCount: number | null;
  homePort: string | null;
  cruisingRegions: string[];
  weeklyRateLow: number | null;
  weeklyRateHigh: number | null;
  currency: string;
  heroImageUrl: string | null;
};

type AvailabilityRecord = {
  id: string;
  startDate: string;
  endDate: string;
  status:
    | "available"
    | "provisional"
    | "option"
    | "booked"
    | "unavailable"
    | "maintenance";
  location: string | null;
  region: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  weeklyRate: number | null;
  currency: string;
  yacht: YachtRecord | null;
  source: {
    id: string;
    name: string;
  } | null;
};

type AvailabilityResponse = {
  success: boolean;
  error?: string;
  data?: AvailabilityRecord[];
};

type YachtMatch = {
  yacht: YachtRecord;
  sourceName: string | null;
  weeklyRate: number | null;
  currency: string;
  availableFrom: string;
  availableTo: string;
  route: string | null;
  score: number;
  reasons: string[];
  warnings: string[];
};

type AvailabilityCheckSource =
  | "yachtfolio"
  | "manager_email"
  | "manager_manual"
  | "management_calendar"
  | "other";

type AvailabilityCheckStatus =
  | "available"
  | "booked"
  | "option"
  | "unavailable"
  | "pending";

type AvailabilityCheck = {
  id: string;
  inquiryId: string;
  yachtId: string;
  source: AvailabilityCheckSource;
  status: AvailabilityCheckStatus;
  startDate: string;
  endDate: string;
  checkedAt: string;
  checkedBy: string | null;
  notes: string | null;
};

type AvailabilityChecksResponse = {
  success: boolean;
  error?: string;
  checks?: AvailabilityCheck[];
  check?: AvailabilityCheck;
};

type EmailDraftRecord = {
  id: string;
};

type EmailDraftResponse = {
  success: boolean;
  error?: string;
  draft?: EmailDraftRecord | null;
};

type YachtAccessType =
  | "controlled"
  | "managed"
  | "broker_access"
  | "reference";

type CalendarAuthority =
  | "our_company"
  | "owner"
  | "charter_manager"
  | "operator"
  | "unknown";

type BookingModel =
  | "direct"
  | "confirmation_required"
  | "owner_approval_required"
  | "reference_only";

type YachtAccessProfile = {
  id: string;
  yachtId: string;
  accessType: YachtAccessType;
  calendarAuthority: CalendarAuthority;
  bookingModel: BookingModel;
  clientProposalPermission: boolean;
  publicListingPermission: boolean;
  notes: string | null;
  updatedAt: string | null;
};

type YachtAccessResponse = {
  success: boolean;
  error?: string;
  profiles?: YachtAccessProfile[];
  profile?: YachtAccessProfile;
};

type YachtAccessForm = {
  accessType: YachtAccessType;
  calendarAuthority: CalendarAuthority;
  bookingModel: BookingModel;
  clientProposalPermission: boolean;
  publicListingPermission: boolean;
  notes: string;
};

type CheckEditor = {
  yachtId: string;
  source: AvailabilityCheckSource;
} | null;

type ManagerContact = {
  id: string;
  yachtId: string;
  managementCompany: string | null;
  contactName: string | null;
  role: string;
  email: string;
  phone: string | null;
  updatedAt: string | null;
};

type ManagerContactsResponse = {
  success: boolean;
  error?: string;
  contacts?: ManagerContact[];
  contact?: ManagerContact;
};

type ManagerContactForm = {
  managementCompany: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
};


const CHECK_STATUSES: Array<{
  value: AvailabilityCheckStatus;
  label: string;
}> = [
  {
    value: "available",
    label: "Available",
  },
  {
    value: "option",
    label: "Option",
  },
  {
    value: "booked",
    label: "Booked",
  },
  {
    value: "unavailable",
    label: "Unavailable",
  },
  {
    value: "pending",
    label: "Request sent",
  },
];

export function InquiryMatchActions({
  inquiry,
}: {
  inquiry: InquiryMatchInput;
}) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<YachtMatch[]>([]);
  const [checks, setChecks] = useState<AvailabilityCheck[]>([]);
  const [contacts, setContacts] = useState<ManagerContact[]>([]);
  const [accessProfiles, setAccessProfiles] =
    useState<YachtAccessProfile[]>([]);
  const [selectedYachtId, setSelectedYachtId] =
    useState<string | null>(null);

  const [editor, setEditor] =
    useState<CheckEditor>(null);

  const [editorStatus, setEditorStatus] =
    useState<AvailabilityCheckStatus>("available");

  const [editorNotes, setEditorNotes] =
    useState("");

  const [savingCheck, setSavingCheck] =
    useState(false);

  const [contactEditorYachtId, setContactEditorYachtId] =
    useState<string | null>(null);

  const [contactForm, setContactForm] =
    useState<ManagerContactForm>({
      managementCompany: "",
      contactName: "",
      role: "Charter Manager",
      email: "",
      phone: "",
    });

  const [savingContact, setSavingContact] =
    useState(false);

  const [accessEditorYachtId, setAccessEditorYachtId] =
    useState<string | null>(null);

  const [accessForm, setAccessForm] =
    useState<YachtAccessForm>({
      accessType: "broker_access",
      calendarAuthority: "unknown",
      bookingModel: "owner_approval_required",
      clientProposalPermission: true,
      publicListingPermission: false,
      notes: "",
    });

  const [savingAccess, setSavingAccess] =
    useState(false);

  const [emailingYachtId, setEmailingYachtId] =
    useState<string | null>(null);

  const [copiedYachtId, setCopiedYachtId] =
    useState<string | null>(null);

  const [portalReady, setPortalReady] =
    useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setEditor(null);
        setContactEditorYachtId(null);
        setAccessEditorYachtId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedMatch = useMemo(
    () =>
      matches.find(
        (match) => match.yacht.id === selectedYachtId
      ) ?? null,
    [matches, selectedYachtId]
  );

  const checksByYacht = useMemo(() => {
    const map =
      new Map<string, AvailabilityCheck[]>();

    for (const check of checks) {
      const current = map.get(check.yachtId) ?? [];
      current.push(check);
      map.set(check.yachtId, current);
    }

    for (const yachtChecks of map.values()) {
      yachtChecks.sort(
        (left, right) =>
          new Date(right.checkedAt).getTime() -
          new Date(left.checkedAt).getTime()
      );
    }

    return map;
  }, [checks]);

  const contactsByYacht = useMemo(() => {
    const map = new Map<string, ManagerContact>();

    for (const contact of contacts) {
      map.set(contact.yachtId, contact);
    }

    return map;
  }, [contacts]);

  const accessByYacht = useMemo(() => {
    const map = new Map<string, YachtAccessProfile>();

    for (const profile of accessProfiles) {
      map.set(profile.yachtId, profile);
    }

    return map;
  }, [accessProfiles]);

  async function openMatcher() {
    setIsOpen((current) => !current);

    if (hasLoaded || isLoading) {
      return;
    }

    await loadMatchesAndChecks();
  }

  async function loadMatchesAndChecks() {
    if (!inquiry.startDate || !inquiry.endDate) {
      setError(
        "Add both charter dates before matching the fleet."
      );
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedYachtId(null);

    try {
      const availabilityParams = new URLSearchParams({
        startDate: inquiry.startDate,
        endDate: inquiry.endDate,
        status: "available",
        limit: "1000",
      });

      const checksParams = new URLSearchParams({
        inquiryId: inquiry.id,
      });

      const [
        availabilityResponse,
        checksResponse,
      ] = await Promise.all([
        fetch(
          `/api/availability?${availabilityParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        ),
        fetch(
          `/api/availability-checks?${checksParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        ),
      ]);

      const availabilityPayload =
        (await availabilityResponse.json()) as AvailabilityResponse;

      const checksPayload =
        (await checksResponse.json()) as AvailabilityChecksResponse;

      if (
        !availabilityResponse.ok ||
        !availabilityPayload.success
      ) {
        throw new Error(
          availabilityPayload.error ??
            "Could not match the fleet."
        );
      }

      if (
        !checksResponse.ok ||
        !checksPayload.success
      ) {
        throw new Error(
          checksPayload.error ??
            "Could not load availability verification."
        );
      }

      const rankedMatches = buildRankedMatches(
        availabilityPayload.data ?? [],
        inquiry
      );

      let loadedContacts: ManagerContact[] = [];
      let loadedAccessProfiles: YachtAccessProfile[] = [];

      if (rankedMatches.length > 0) {
        const yachtIds = rankedMatches
          .map((match) => match.yacht.id)
          .join(",");

        const [
          contactsResponse,
          accessResponse,
        ] = await Promise.all([
          fetch(
            `/api/yacht-contacts?yachtIds=${encodeURIComponent(
              yachtIds
            )}`,
            {
              method: "GET",
              cache: "no-store",
            }
          ),
          fetch(
            `/api/yacht-access?yachtIds=${encodeURIComponent(
              yachtIds
            )}`,
            {
              method: "GET",
              cache: "no-store",
            }
          ),
        ]);

        const contactsPayload =
          (await contactsResponse.json()) as ManagerContactsResponse;

        const accessPayload =
          (await accessResponse.json()) as YachtAccessResponse;

        if (
          !contactsResponse.ok ||
          !contactsPayload.success
        ) {
          throw new Error(
            contactsPayload.error ??
              "Could not load Charter Manager contacts."
          );
        }

        if (
          !accessResponse.ok ||
          !accessPayload.success
        ) {
          throw new Error(
            accessPayload.error ??
              "Could not load yacht access settings."
          );
        }

        loadedContacts = contactsPayload.contacts ?? [];
        loadedAccessProfiles = accessPayload.profiles ?? [];
      }

      setMatches(rankedMatches);
      setChecks(checksPayload.checks ?? []);
      setContacts(loadedContacts);
      setAccessProfiles(loadedAccessProfiles);
      setHasLoaded(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not match the fleet."
      );
      setMatches([]);
      setChecks([]);
      setContacts([]);
      setAccessProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }

  function openCheckEditor(
    yachtId: string,
    source: AvailabilityCheckSource
  ) {
    setEditor({
      yachtId,
      source,
    });

    setEditorStatus(
      source === "manager_email"
        ? "pending"
        : "available"
    );

    setEditorNotes("");
  }

  async function saveAvailabilityCheck() {
    if (
      !editor ||
      !inquiry.startDate ||
      !inquiry.endDate
    ) {
      return;
    }

    setSavingCheck(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/availability-checks",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inquiryId: inquiry.id,
            yachtId: editor.yachtId,
            source: editor.source,
            status: editorStatus,
            startDate: inquiry.startDate,
            endDate: inquiry.endDate,
            notes: editorNotes.trim() || null,
          }),
        }
      );

      const payload =
        (await response.json()) as AvailabilityChecksResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ??
            "Could not save availability verification."
        );
      }

      if (payload.check) {
        setChecks((current) => [
          payload.check!,
          ...current,
        ]);
      }

      if (
        editorStatus === "booked" ||
        editorStatus === "unavailable"
      ) {
        setSelectedYachtId((current) =>
          current === editor.yachtId
            ? null
            : current
        );
      }

      setEditor(null);
      setEditorNotes("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save availability verification."
      );
    } finally {
      setSavingCheck(false);
    }
  }

  function openAccessEditor(
    yachtId: string
  ) {
    const existing =
      accessByYacht.get(yachtId) ?? null;

    setAccessEditorYachtId(yachtId);

    setAccessForm(
      existing
        ? {
            accessType: existing.accessType,
            calendarAuthority:
              existing.calendarAuthority,
            bookingModel: existing.bookingModel,
            clientProposalPermission:
              existing.clientProposalPermission,
            publicListingPermission:
              existing.publicListingPermission,
            notes: existing.notes ?? "",
          }
        : {
            accessType: "broker_access",
            calendarAuthority: "unknown",
            bookingModel:
              "owner_approval_required",
            clientProposalPermission: true,
            publicListingPermission: false,
            notes: "",
          }
    );
  }

  function updateAccessType(
    value: YachtAccessType
  ) {
    const defaults =
      getAccessDefaults(value);

    setAccessForm((current) => ({
      ...current,
      accessType: value,
      ...defaults,
    }));

    setError(null);
  }

  function updateAccessField<
    K extends keyof YachtAccessForm
  >(
    field: K,
    value: YachtAccessForm[K]
  ) {
    setAccessForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError(null);
  }

  async function saveAccessProfile(
    yachtId: string
  ) {
    setSavingAccess(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/yacht-access",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            yachtId,
            accessType: accessForm.accessType,
            calendarAuthority:
              accessForm.calendarAuthority,
            bookingModel:
              accessForm.bookingModel,
            clientProposalPermission:
              accessForm.clientProposalPermission,
            publicListingPermission:
              accessForm.publicListingPermission,
            notes:
              accessForm.notes.trim() || null,
          }),
        }
      );

      const payload =
        (await response.json()) as YachtAccessResponse;

      if (
        !response.ok ||
        !payload.success ||
        !payload.profile
      ) {
        throw new Error(
          payload.error ??
            "Could not save yacht access settings."
        );
      }

      setAccessProfiles((current) => {
        const withoutCurrent =
          current.filter(
            (profile) =>
              profile.yachtId !==
              payload.profile!.yachtId
          );

        return [
          payload.profile!,
          ...withoutCurrent,
        ];
      });

      if (
        !payload.profile.clientProposalPermission
      ) {
        setSelectedYachtId((current) =>
          current === yachtId
            ? null
            : current
        );
      }

      setAccessEditorYachtId(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save yacht access settings."
      );
    } finally {
      setSavingAccess(false);
    }
  }

  function openManagerContactEditor(
    yachtId: string
  ) {
    const existing =
      contactsByYacht.get(yachtId) ?? null;

    setContactEditorYachtId(yachtId);

    setContactForm({
      managementCompany:
        existing?.managementCompany ?? "",
      contactName:
        existing?.contactName ?? "",
      role:
        existing?.role ?? "Charter Manager",
      email:
        existing?.email ?? "",
      phone:
        existing?.phone ?? "",
    });
  }

  function updateContactField(
    field: keyof ManagerContactForm,
    value: string
  ) {
    setContactForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError(null);
  }

  async function saveManagerContact(
    yachtId: string
  ) {
    if (!contactForm.email.trim()) {
      setError(
        "Enter the Charter Manager email before saving."
      );
      return;
    }

    setSavingContact(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/yacht-contacts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            yachtId,
            managementCompany:
              contactForm.managementCompany.trim() ||
              null,
            contactName:
              contactForm.contactName.trim() || null,
            role:
              contactForm.role.trim() ||
              "Charter Manager",
            email: contactForm.email.trim(),
            phone:
              contactForm.phone.trim() || null,
          }),
        }
      );

      const payload =
        (await response.json()) as ManagerContactsResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ??
            "Could not save Charter Manager contact."
        );
      }

      if (payload.contact) {
        setContacts((current) => {
          const withoutCurrent = current.filter(
            (contact) =>
              contact.yachtId !==
              payload.contact!.yachtId
          );

          return [
            payload.contact!,
            ...withoutCurrent,
          ];
        });
      }

      setContactEditorYachtId(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save Charter Manager contact."
      );
    } finally {
      setSavingContact(false);
    }
  }

  async function emailManager(
    match: YachtMatch
  ) {
    const contact =
      contactsByYacht.get(match.yacht.id) ?? null;

    if (!contact) {
      openManagerContactEditor(match.yacht.id);
      return;
    }

    if (!inquiry.startDate || !inquiry.endDate) {
      setError(
        "The inquiry needs both charter dates before creating the verification email."
      );
      return;
    }

    const {
      subject,
      body,
    } = buildVerificationEmail(
      match,
      inquiry
    );

    setEmailingYachtId(match.yacht.id);
    setError(null);

    try {
      const response = await fetch(
        "/api/email-drafts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inquiryId: inquiry.id,
            yachtId: match.yacht.id,
            managerContactId: contact.id,
            purpose: "availability_verification",
            toEmail: contact.email,
            toName:
              contact.contactName ??
              contact.managementCompany ??
              "Charter Manager",
            subject,
            body,
            startDate: inquiry.startDate,
            endDate: inquiry.endDate,
          }),
        }
      );

      const payload =
        (await response.json()) as EmailDraftResponse;

      if (
        !response.ok ||
        !payload.success ||
        !payload.draft?.id
      ) {
        throw new Error(
          payload.error ??
            "Could not create the manager email draft."
        );
      }

      setIsOpen(false);
      setEditor(null);
      setContactEditorYachtId(null);

      router.push(
        `/email?draft=${encodeURIComponent(
          payload.draft.id
        )}`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create the manager email draft."
      );
    } finally {
      setEmailingYachtId(null);
    }
  }

  async function copyVerificationRequest(
    match: YachtMatch
  ) {
    const message = buildVerificationRequest(
      match,
      inquiry
    );

    try {
      await navigator.clipboard.writeText(message);
      setCopiedYachtId(match.yacht.id);

      window.setTimeout(() => {
        setCopiedYachtId((current) =>
          current === match.yacht.id
            ? null
            : current
        );
      }, 1800);
    } catch {
      setError(
        "Could not copy the verification request. Copy it manually from the manager verification panel."
      );
    }
  }

  function selectYacht(match: YachtMatch) {
    const yachtChecks =
      checksByYacht.get(match.yacht.id) ?? [];

    const effective =
      getEffectiveAvailability(yachtChecks);

    if (
      effective?.status === "booked" ||
      effective?.status === "unavailable"
    ) {
      return;
    }

    setSelectedYachtId(match.yacht.id);
  }

  function buildProposal() {
    if (!selectedMatch) {
      return;
    }

    const params = new URLSearchParams({
      inquiryId: inquiry.id,
      yachtId: selectedMatch.yacht.id,
      yachtName: selectedMatch.yacht.name,
      currency:
        selectedMatch.currency ||
        inquiry.currency ||
        "EUR",
    });

    if (selectedMatch.weeklyRate !== null) {
      params.set(
        "weeklyRate",
        String(selectedMatch.weeklyRate)
      );
    }

    if (inquiry.startDate) {
      params.set("startDate", inquiry.startDate);
    }

    if (inquiry.endDate) {
      params.set("endDate", inquiry.endDate);
    }

    if (inquiry.destination) {
      params.set(
        "destination",
        inquiry.destination
      );
    }

    if (inquiry.guests !== null) {
      params.set(
        "guests",
        String(inquiry.guests)
      );
    }

    router.push(
      `/proposals/new?${params.toString()}`
    );
  }

  const matcherModal = isOpen ? (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Match yachts"
    >
      <button
        type="button"
        aria-label="Close yacht matcher"
        onClick={() => {
          setIsOpen(false);
          setEditor(null);
          setContactEditorYachtId(null);
          setAccessEditorYachtId(null);
        }}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
      />

      <section className="ui-panel relative z-10 flex max-h-[calc(100dvh-1rem)] w-full max-w-[1180px] min-w-0 flex-col overflow-hidden rounded-[28px] shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
        <div className="relative shrink-0 overflow-visible border-b border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))] px-5 py-6 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute right-12 top-1/2 size-40 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="ui-hero-muted text-[10px] font-semibold uppercase tracking-[0.22em]">
                Inquiry intelligence
              </p>

              <h2 className="mt-2 pb-1 font-heading text-3xl leading-[1.15] tracking-[0.045em] text-[var(--hero-foreground)] sm:text-4xl">
                Match yachts
              </h2>

              <p className="ui-hero-muted mt-3 text-sm leading-6">
                {formatDateRange(
                  inquiry.startDate,
                  inquiry.endDate
                )}
                {inquiry.destination
                  ? ` · ${inquiry.destination}`
                  : ""}
                {inquiry.guests !== null
                  ? ` · ${inquiry.guests} guests`
                  : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setEditor(null);
                setContactEditorYachtId(null);
                setAccessEditorYachtId(null);
              }}
              className="ui-secondary-button apple-transition inline-flex size-11 shrink-0 items-center justify-center rounded-xl p-0 hover:bg-accent"
              aria-label="Close yacht matcher"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background/70 p-4 sm:p-6">
          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Finding yachts and verification history
            </div>
          ) : error ? (
            <div className="mx-auto max-w-xl py-14">
              <div className="flex items-start gap-3 rounded-[22px] border border-amber-500/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <span>{error}</span>
              </div>

              <button
                type="button"
                onClick={() => void loadMatchesAndChecks()}
                className="ui-primary-button mt-4 min-h-11 w-full px-4 text-sm font-semibold"
              >
                Try again
              </button>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-5 text-center">
              <Ship className="size-8 text-muted-foreground" />

              <p className="mt-4 text-base font-semibold text-foreground">
                No yachts available for the full date range
              </p>

              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Change the inquiry dates or review the general availability calendar.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {matches.map((match, index) => {
                const yachtChecks =
                  checksByYacht.get(match.yacht.id) ?? [];

                const yachtfolioCheck =
                  getLatestCheck(yachtChecks, [
                    "yachtfolio",
                  ]);

                const managerCheck =
                  getLatestCheck(yachtChecks, [
                    "manager_email",
                    "manager_manual",
                  ]);

                const effective =
                  getEffectiveAvailability(yachtChecks);

                const accessProfile =
                  accessByYacht.get(match.yacht.id) ??
                  null;

                const accessPolicy =
                  getAccessPolicy(accessProfile);

                const blocked =
                  effective?.status === "booked" ||
                  effective?.status === "unavailable" ||
                  !accessPolicy.clientProposalAllowed;

                const isSelected =
                  selectedYachtId === match.yacht.id;

                const needsManagerConfirmation =
                  accessPolicy.alwaysRequireApproval
                    ? !isFreshAvailableManagerCheck(
                        managerCheck
                      )
                    : accessPolicy.requiresVerification
                      ? shouldRecommendManagerConfirmation(
                          inquiry.startDate,
                          managerCheck
                        )
                      : false;

                const managerContact =
                  contactsByYacht.get(match.yacht.id) ??
                  null;

                const confidence =
                  getAvailabilityConfidence({
                    yachtfolioCheck,
                    managerCheck,
                    needsManagerConfirmation,
                    accessProfile,
                  });

                const editorOpen =
                  editor?.yachtId === match.yacht.id;

                return (
                  <article
                    key={match.yacht.id}
                    className={`apple-transition min-w-0 overflow-hidden rounded-[24px] border ${
                      isSelected
                        ? "border-cyan-500/45 bg-cyan-500/[0.07]"
                        : blocked
                          ? "border-red-500/20 bg-red-500/[0.04]"
                          : "border-border bg-card/65 hover:border-ring/25"
                    }`}
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-border bg-background/55">
                          {match.yacht.heroImageUrl ? (
                            <img
                              src={match.yacht.heroImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Ship className="size-6 text-muted-foreground" />
                          )}

                          {isSelected ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-cyan-950/65 text-white">
                              <Check className="size-6" />
                            </span>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-foreground">
                                {match.yacht.name}
                              </p>

                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {[
                                  match.yacht.yachtType,
                                  match.yacht.lengthMeters
                                    ? `${match.yacht.lengthMeters} m`
                                    : null,
                                  match.sourceName,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") ||
                                  "Connected yacht"}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              {index < 3 ? (
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                                  Recommended
                                </p>
                              ) : null}

                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {match.weeklyRate !== null
                                  ? formatMoney(
                                      match.weeklyRate,
                                      match.currency
                                    )
                                  : "Rate on request"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <MatchMetric
                              icon={
                                <Users className="size-3.5" />
                              }
                              value={
                                getGuestCapacity(match.yacht) !==
                                null
                                  ? `${getGuestCapacity(
                                      match.yacht
                                    )} guests`
                                  : "Guests unknown"
                              }
                            />

                            <MatchMetric
                              icon={
                                <MapPin className="size-3.5" />
                              }
                              value={
                                match.route ??
                                match.yacht.homePort ??
                                "Route unknown"
                              }
                            />

                            <MatchMetric
                              icon={
                                <WalletCards className="size-3.5" />
                              }
                              value={`${match.availableFrom} – ${match.availableTo}`}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background/60 text-muted-foreground">
                            <KeyRound className="size-4" />
                          </div>

                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                              Yacht relationship
                            </p>

                            <p className="mt-1 text-xs font-semibold text-foreground">
                              {accessProfile
                                ? accessTypeLabel(
                                    accessProfile.accessType
                                  )
                                : "Unclassified"}
                            </p>

                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                              {accessProfile
                                ? `${calendarAuthorityLabel(
                                    accessProfile.calendarAuthority
                                  )} · ${bookingModelLabel(
                                    accessProfile.bookingModel
                                  )}`
                                : "Current verification workflow remains active until you classify this yacht."}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            openAccessEditor(
                              match.yacht.id
                            )
                          }
                          className="ui-secondary-button apple-transition min-h-9 shrink-0 px-3 text-[11px] font-semibold hover:bg-accent"
                        >
                          {accessProfile
                            ? "Edit access"
                            : "Classify yacht"}
                        </button>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <EvidenceCard
                          eyebrow="Source availability"
                          title="Available"
                          detail={
                            match.sourceName
                              ? `Imported from ${match.sourceName}`
                              : "Imported connected source"
                          }
                          tone="positive"
                        />

                        <EvidenceCard
                          eyebrow={
                            accessPolicy.controlled
                              ? "External network check"
                              : "Yachtfolio check"
                          }
                          title={
                            accessPolicy.referenceOnly
                              ? "Reference signal"
                              : yachtfolioCheck
                                ? formatStatus(
                                    yachtfolioCheck.status
                                  )
                                : accessPolicy.controlled
                                  ? "Optional"
                                  : "Not recorded"
                          }
                          detail={
                            yachtfolioCheck
                              ? `Checked ${formatRelativeTime(
                                  yachtfolioCheck.checkedAt
                                )}`
                              : accessPolicy.controlled
                                ? "Your controlled calendar is the primary authority"
                                : accessPolicy.referenceOnly
                                  ? "Do not treat reference data as confirmed availability"
                                  : "Record the broker's Yachtfolio result"
                          }
                          tone={
                            accessPolicy.referenceOnly
                              ? "neutral"
                              : statusTone(
                                  yachtfolioCheck?.status
                                )
                          }
                        />

                        <EvidenceCard
                          eyebrow={
                            accessPolicy.controlled
                              ? "Booking authority"
                              : accessPolicy.managed
                                ? "Owner approval"
                                : accessPolicy.referenceOnly
                                  ? "Representation"
                                  : "Manager verification"
                          }
                          title={
                            accessPolicy.controlled
                              ? "Your company"
                              : accessPolicy.referenceOnly
                                ? "Not cleared"
                                : managerCheck
                                  ? formatStatus(
                                      managerCheck.status
                                    )
                                  : needsManagerConfirmation
                                    ? accessPolicy.managed
                                      ? "Required"
                                      : "Recommended"
                                    : "Not required yet"
                          }
                          detail={
                            accessPolicy.controlled
                              ? "No external availability confirmation is required for this controlled yacht"
                              : accessPolicy.referenceOnly
                                ? "Reference-only yacht cannot be proposed until access is upgraded"
                                : managerCheck
                                  ? `${sourceLabel(
                                      managerCheck.source
                                    )} · ${formatRelativeTime(
                                      managerCheck.checkedAt
                                    )}`
                                  : needsManagerConfirmation
                                    ? accessPolicy.managed
                                      ? "Owner or Charter Manager approval is still required"
                                      : "Near-term charter needs a fresh confirmation"
                                    : "No direct confirmation recorded"
                          }
                          tone={
                            accessPolicy.controlled
                              ? "positive"
                              : accessPolicy.referenceOnly
                                ? "warning"
                                : managerCheck
                                  ? statusTone(
                                      managerCheck.status
                                    )
                                  : needsManagerConfirmation
                                    ? "warning"
                                    : "neutral"
                          }
                        />

                        <EvidenceCard
                          eyebrow="Confidence"
                          title={confidence.label}
                          detail={confidence.detail}
                          tone={confidence.tone}
                        />
                      </div>

                      {!accessPolicy.controlled ? (
                        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background/60 text-muted-foreground">
                            <Building2 className="size-4" />
                          </div>

                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                              Charter Manager contact
                            </p>

                            {managerContact ? (
                              <>
                                <p className="mt-1 truncate text-xs font-semibold text-foreground">
                                  {managerContact.contactName ||
                                    managerContact.managementCompany ||
                                    "Charter Manager"}
                                </p>

                                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                  {managerContact.managementCompany
                                    ? `${managerContact.managementCompany} · `
                                    : ""}
                                  {managerContact.email}
                                </p>
                              </>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">
                                No verification contact saved yet.
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            openManagerContactEditor(
                              match.yacht.id
                            )
                          }
                          className="ui-secondary-button apple-transition min-h-9 shrink-0 px-3 text-[11px] font-semibold hover:bg-accent"
                        >
                          {managerContact
                            ? "Edit contact"
                            : "Add contact"}
                        </button>
                      </div>

                      ) : null}

                      {effective ? (
                        <div
                          className={`mt-4 rounded-2xl border px-4 py-3 text-xs ${
                            effective.status === "available"
                              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200"
                              : effective.status === "booked" ||
                                  effective.status ===
                                    "unavailable"
                                ? "border-red-500/20 bg-red-500/[0.07] text-red-700 dark:text-red-200"
                                : "border-amber-500/20 bg-amber-500/[0.07] text-amber-800 dark:text-amber-200"
                          }`}
                        >
                          <span className="font-semibold">
                            Current availability intelligence:
                          </span>{" "}
                          {formatStatus(effective.status)} ·{" "}
                          {sourceLabel(effective.source)}
                        </div>
                      ) : null}

                      {match.reasons.length > 0 ? (
                        <p className="mt-4 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                          {match.reasons
                            .slice(0, 2)
                            .join(" · ")}
                        </p>
                      ) : null}

                      {match.warnings.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                          {match.warnings
                            .slice(0, 2)
                            .join(" · ")}
                        </p>
                      ) : null}

                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        {!accessPolicy.controlled ? (
                          <button
                            type="button"
                            onClick={() =>
                              openCheckEditor(
                                match.yacht.id,
                                "yachtfolio"
                              )
                            }
                            className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent"
                          >
                            <Radio className="size-3.5" />
                            Record Yachtfolio check
                          </button>
                        ) : null}

                        {!accessPolicy.controlled ? (
                          <button
                            type="button"
                            onClick={() =>
                              void emailManager(match)
                            }
                            disabled={
                              emailingYachtId ===
                              match.yacht.id
                            }
                            className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {emailingYachtId ===
                            match.yacht.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Mail className="size-3.5" />
                            )}
                            {managerContact
                              ? accessPolicy.managed
                                ? "Request owner approval"
                                : "Create email draft"
                              : "Add manager contact"}
                          </button>
                        ) : null}

                        {!accessPolicy.controlled ? (
                          <button
                            type="button"
                            onClick={() =>
                              openCheckEditor(
                                match.yacht.id,
                                "manager_email"
                              )
                            }
                            className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent"
                          >
                            <CheckCircle2 className="size-3.5" />
                            {accessPolicy.managed
                              ? "Record owner reply"
                              : "Record manager reply"}
                          </button>
                        ) : null}

                        {!accessPolicy.controlled ? (
                          <button
                            type="button"
                            onClick={() =>
                              void copyVerificationRequest(match)
                            }
                            className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent"
                          >
                            <Clipboard className="size-3.5" />
                            {copiedYachtId === match.yacht.id
                              ? "Copied"
                              : accessPolicy.managed
                                ? "Copy approval request"
                                : "Copy request"}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => selectYacht(match)}
                          className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 sm:col-span-2"
                        >
                          {!accessPolicy.clientProposalAllowed
                            ? "Reference only"
                            : blocked
                              ? "Do not offer"
                              : isSelected
                                ? "Selected"
                                : accessPolicy.controlled
                                  ? "Select controlled yacht"
                                  : "Select yacht"}
                        </button>
                      </div>

                      {accessEditorYachtId ===
                      match.yacht.id ? (
                        <div className="mt-5 rounded-[20px] border border-border bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Yacht access & control
                              </p>

                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {match.yacht.name}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setAccessEditorYachtId(
                                  null
                                )
                              }
                              className="rounded-xl p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              aria-label="Close yacht access editor"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Access type
                              </span>

                              <select
                                value={
                                  accessForm.accessType
                                }
                                onChange={(event) =>
                                  updateAccessType(
                                    event.target
                                      .value as YachtAccessType
                                  )
                                }
                                className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-xs"
                              >
                                <option value="controlled">
                                  Controlled fleet
                                </option>
                                <option value="managed">
                                  Managed yacht
                                </option>
                                <option value="broker_access">
                                  Broker access
                                </option>
                                <option value="reference">
                                  Reference only
                                </option>
                              </select>
                            </label>

                            <label className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Calendar authority
                              </span>

                              <select
                                value={
                                  accessForm.calendarAuthority
                                }
                                onChange={(event) =>
                                  updateAccessField(
                                    "calendarAuthority",
                                    event.target
                                      .value as CalendarAuthority
                                  )
                                }
                                className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-xs"
                              >
                                <option value="our_company">
                                  Our company
                                </option>
                                <option value="owner">
                                  Owner
                                </option>
                                <option value="charter_manager">
                                  Charter Manager
                                </option>
                                <option value="operator">
                                  Third-party operator
                                </option>
                                <option value="unknown">
                                  Unknown
                                </option>
                              </select>
                            </label>

                            <label className="block sm:col-span-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Booking model
                              </span>

                              <select
                                value={
                                  accessForm.bookingModel
                                }
                                onChange={(event) =>
                                  updateAccessField(
                                    "bookingModel",
                                    event.target
                                      .value as BookingModel
                                  )
                                }
                                className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-xs"
                              >
                                <option value="direct">
                                  Direct booking / controlled calendar
                                </option>
                                <option value="confirmation_required">
                                  Confirmation required
                                </option>
                                <option value="owner_approval_required">
                                  Owner approval required
                                </option>
                                <option value="reference_only">
                                  Reference only
                                </option>
                              </select>
                            </label>

                            <label className="flex items-start gap-3 rounded-xl border border-border bg-background/45 p-3">
                              <input
                                type="checkbox"
                                checked={
                                  accessForm.clientProposalPermission
                                }
                                onChange={(event) =>
                                  updateAccessField(
                                    "clientProposalPermission",
                                    event.target.checked
                                  )
                                }
                                disabled={
                                  accessForm.accessType ===
                                  "reference"
                                }
                                className="mt-0.5 size-4"
                              />

                              <span>
                                <span className="block text-xs font-semibold text-foreground">
                                  Client proposal permitted
                                </span>
                                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                                  This yacht may appear in a client-facing proposal.
                                </span>
                              </span>
                            </label>

                            <label className="flex items-start gap-3 rounded-xl border border-border bg-background/45 p-3">
                              <input
                                type="checkbox"
                                checked={
                                  accessForm.publicListingPermission
                                }
                                onChange={(event) =>
                                  updateAccessField(
                                    "publicListingPermission",
                                    event.target.checked
                                  )
                                }
                                className="mt-0.5 size-4"
                              />

                              <span>
                                <span className="block text-xs font-semibold text-foreground">
                                  Public listing permitted
                                </span>
                                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                                  Only enable when the brokerage has explicit permission to publish it publicly.
                                </span>
                              </span>
                            </label>
                          </div>

                          <textarea
                            value={accessForm.notes}
                            onChange={(event) =>
                              updateAccessField(
                                "notes",
                                event.target.value
                              )
                            }
                            rows={3}
                            placeholder="Optional internal note about access, representation rights or approval rules."
                            className="ui-input mt-3 w-full resize-y rounded-xl px-3 py-3 text-xs leading-5"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void saveAccessProfile(
                                match.yacht.id
                              )
                            }
                            disabled={savingAccess}
                            className="ui-primary-button apple-transition mt-4 inline-flex min-h-10 items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingAccess ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="size-3.5" />
                            )}
                            Save yacht access
                          </button>
                        </div>
                      ) : null}

                      {contactEditorYachtId ===
                      match.yacht.id ? (
                        <div className="mt-5 rounded-[20px] border border-border bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Verification contact
                              </p>

                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {match.yacht.name}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setContactEditorYachtId(
                                  null
                                )
                              }
                              className="rounded-xl p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              aria-label="Close manager contact editor"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Management company
                              </span>
                              <div className="relative mt-2">
                                <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  value={
                                    contactForm.managementCompany
                                  }
                                  onChange={(event) =>
                                    updateContactField(
                                      "managementCompany",
                                      event.target.value
                                    )
                                  }
                                  placeholder="ORVAS"
                                  className="ui-input h-11 w-full rounded-xl pl-10 pr-3 text-xs"
                                />
                              </div>
                            </label>

                            <label className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Contact name
                              </span>
                              <div className="relative mt-2">
                                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  value={
                                    contactForm.contactName
                                  }
                                  onChange={(event) =>
                                    updateContactField(
                                      "contactName",
                                      event.target.value
                                    )
                                  }
                                  placeholder="Anna Rossi"
                                  className="ui-input h-11 w-full rounded-xl pl-10 pr-3 text-xs"
                                />
                              </div>
                            </label>

                            <label className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Role
                              </span>
                              <input
                                value={contactForm.role}
                                onChange={(event) =>
                                  updateContactField(
                                    "role",
                                    event.target.value
                                  )
                                }
                                placeholder="Charter Manager"
                                className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-xs"
                              />
                            </label>

                            <label className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Email *
                              </span>
                              <div className="relative mt-2">
                                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  type="email"
                                  value={contactForm.email}
                                  onChange={(event) =>
                                    updateContactField(
                                      "email",
                                      event.target.value
                                    )
                                  }
                                  placeholder="charter@company.com"
                                  className="ui-input h-11 w-full rounded-xl pl-10 pr-3 text-xs"
                                />
                              </div>
                            </label>

                            <label className="block sm:col-span-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Phone
                              </span>
                              <input
                                value={contactForm.phone}
                                onChange={(event) =>
                                  updateContactField(
                                    "phone",
                                    event.target.value
                                  )
                                }
                                placeholder="+33 ..."
                                className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-xs"
                              />
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              void saveManagerContact(
                                match.yacht.id
                              )
                            }
                            disabled={savingContact}
                            className="ui-primary-button apple-transition mt-4 inline-flex min-h-10 items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingContact ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Save className="size-3.5" />
                            )}
                            Save manager contact
                          </button>
                        </div>
                      ) : null}

                      {editorOpen ? (
                        <div className="mt-5 rounded-[20px] border border-border bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {editor.source === "yachtfolio"
                                  ? "Record Yachtfolio check"
                                  : "Manager verification"}
                              </p>

                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {match.yacht.name} ·{" "}
                                {formatDateRange(
                                  inquiry.startDate,
                                  inquiry.endDate
                                )}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setEditor(null)}
                              className="rounded-xl p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              aria-label="Close verification editor"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          {editor.source ===
                          "manager_email" ? (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.07] px-3 py-3 text-xs leading-5 text-cyan-800 dark:text-cyan-200">
                              <Clock3 className="mt-0.5 size-3.5 shrink-0" />
                              Use “Request sent” when you have emailed the Charter Manager. When they reply, reopen this panel and record Available, Option, Booked or Unavailable.
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {CHECK_STATUSES.filter(
                              (option) =>
                                editor.source !== "yachtfolio" ||
                                option.value !== "pending"
                            ).map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setEditorStatus(option.value)
                                }
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                  editorStatus === option.value
                                    ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
                                    : "border-border bg-background/55 text-muted-foreground hover:bg-accent hover:text-foreground"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>

                          <textarea
                            value={editorNotes}
                            onChange={(event) =>
                              setEditorNotes(event.target.value)
                            }
                            rows={3}
                            placeholder={
                              editor.source === "yachtfolio"
                                ? "Optional note, e.g. checked in Yachtfolio Bookings."
                                : "Optional note, e.g. manager confirmed from Split at €165,000 + VAT/APA."
                            }
                            className="ui-input mt-3 w-full resize-y rounded-xl px-3 py-3 text-xs leading-5"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void saveAvailabilityCheck()
                            }
                            disabled={savingCheck}
                            className="ui-primary-button apple-transition mt-3 inline-flex min-h-10 items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingCheck ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Save className="size-3.5" />
                            )}
                            Save check
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-card/90 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {selectedMatch
                ? "Selected yacht"
                : `${matches.length} matching yacht${
                    matches.length === 1 ? "" : "s"
                  }`}
            </p>

            {selectedMatch ? (
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {selectedMatch.yacht.name}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setEditor(null);
                setContactEditorYachtId(null);
                setAccessEditorYachtId(null);
              }}
              className="ui-secondary-button apple-transition min-h-11 px-5 text-sm font-semibold hover:bg-accent"
            >
              Close
            </button>

            <button
              type="button"
              onClick={buildProposal}
              disabled={!selectedMatch}
              className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <FileText className="size-4" />
              {selectedMatch
                ? `Build proposal for ${selectedMatch.yacht.name}`
                : "Select a yacht first"}
            </button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void openMatcher()}
        className="ui-primary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
        aria-expanded={isOpen}
      >
        <Ship className="size-4" />
        Match yachts
        <ChevronDown className="ml-auto size-4" />
      </button>

      <button
        type="button"
        onClick={buildProposal}
        disabled={!selectedMatch}
        className="ui-secondary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
      >
        <FileText className="size-4" />
        {selectedMatch
          ? `Build proposal for ${selectedMatch.yacht.name}`
          : "Select a yacht to build proposal"}
      </button>

      {portalReady && matcherModal
        ? createPortal(matcherModal, document.body)
        : null}
    </div>
  );
}

function getAccessDefaults(
  accessType: YachtAccessType
): Pick<
  YachtAccessForm,
  | "calendarAuthority"
  | "bookingModel"
  | "clientProposalPermission"
  | "publicListingPermission"
> {
  if (accessType === "controlled") {
    return {
      calendarAuthority: "our_company",
      bookingModel: "direct",
      clientProposalPermission: true,
      publicListingPermission: false,
    };
  }

  if (accessType === "managed") {
    return {
      calendarAuthority: "owner",
      bookingModel: "owner_approval_required",
      clientProposalPermission: true,
      publicListingPermission: false,
    };
  }

  if (accessType === "reference") {
    return {
      calendarAuthority: "unknown",
      bookingModel: "reference_only",
      clientProposalPermission: false,
      publicListingPermission: false,
    };
  }

  return {
    calendarAuthority: "unknown",
    bookingModel: "owner_approval_required",
    clientProposalPermission: true,
    publicListingPermission: false,
  };
}

function getAccessPolicy(
  profile: YachtAccessProfile | null
) {
  const accessType =
    profile?.accessType ?? "broker_access";

  return {
    accessType,
    controlled:
      accessType === "controlled",
    managed:
      accessType === "managed",
    brokerAccess:
      accessType === "broker_access",
    referenceOnly:
      accessType === "reference",
    clientProposalAllowed:
      profile
        ? profile.clientProposalPermission
        : true,
    requiresVerification:
      accessType === "broker_access",
    alwaysRequireApproval:
      accessType === "managed",
  };
}

function isFreshAvailableManagerCheck(
  managerCheck: AvailabilityCheck | null
): boolean {
  if (
    !managerCheck ||
    managerCheck.status !== "available"
  ) {
    return false;
  }

  const checkedAt =
    new Date(managerCheck.checkedAt);

  if (Number.isNaN(checkedAt.getTime())) {
    return false;
  }

  const ageHours =
    (Date.now() - checkedAt.getTime()) /
    3_600_000;

  return ageHours <= 24;
}

function accessTypeLabel(
  value: YachtAccessType
): string {
  const labels: Record<
    YachtAccessType,
    string
  > = {
    controlled: "Controlled fleet",
    managed: "Managed yacht",
    broker_access: "Broker access",
    reference: "Reference only",
  };

  return labels[value];
}

function calendarAuthorityLabel(
  value: CalendarAuthority
): string {
  const labels: Record<
    CalendarAuthority,
    string
  > = {
    our_company: "Calendar controlled by your company",
    owner: "Calendar controlled by owner",
    charter_manager:
      "Calendar controlled by Charter Manager",
    operator:
      "Calendar controlled by operator",
    unknown: "Calendar authority unknown",
  };

  return labels[value];
}

function bookingModelLabel(
  value: BookingModel
): string {
  const labels: Record<
    BookingModel,
    string
  > = {
    direct: "Direct booking",
    confirmation_required:
      "Confirmation required",
    owner_approval_required:
      "Owner approval required",
    reference_only: "Reference only",
  };

  return labels[value];
}

function getAvailabilityConfidence({
  yachtfolioCheck,
  managerCheck,
  needsManagerConfirmation,
  accessProfile,
}: {
  yachtfolioCheck: AvailabilityCheck | null;
  managerCheck: AvailabilityCheck | null;
  needsManagerConfirmation: boolean;
  accessProfile: YachtAccessProfile | null;
}): {
  label: string;
  detail: string;
  tone:
    | "positive"
    | "warning"
    | "negative"
    | "neutral";
} {
  const policy =
    getAccessPolicy(accessProfile);

  if (policy.referenceOnly) {
    return {
      label: "Reference only",
      detail:
        "This yacht is for internal discovery until representation or proposal rights are confirmed.",
      tone: "neutral",
    };
  }

  if (policy.controlled) {
    return {
      label: "Controlled",
      detail:
        "The workspace controls this yacht/calendar, so the connected source can be treated as the primary booking signal.",
      tone: "positive",
    };
  }

  if (
    managerCheck?.status === "booked" ||
    managerCheck?.status === "unavailable"
  ) {
    return {
      label: "Blocked",
      detail:
        "Direct manager evidence says this yacht should not be offered.",
      tone: "negative",
    };
  }

  if (
    managerCheck?.status === "available" &&
    !needsManagerConfirmation
  ) {
    return {
      label: policy.managed
        ? "Pre-approved"
        : "Verified",
      detail: policy.managed
        ? "Availability has been approved for this inquiry. Final contract acceptance may still be required."
        : "Fresh direct manager confirmation is on record.",
      tone: "positive",
    };
  }

  if (managerCheck?.status === "pending") {
    return {
      label: "Pending",
      detail: policy.managed
        ? "Owner or Charter Manager approval is awaiting a reply."
        : "A fresh confirmation request is awaiting a reply.",
      tone: "warning",
    };
  }

  if (managerCheck?.status === "option") {
    return {
      label: "Caution",
      detail:
        "The Charter Manager reports an option on these dates.",
      tone: "warning",
    };
  }

  if (
    yachtfolioCheck?.status === "available" &&
    needsManagerConfirmation
  ) {
    return {
      label: policy.managed
        ? "Owner approval needed"
        : "Medium",
      detail: policy.managed
        ? "Source availability is positive, but owner approval is still required."
        : "Yachtfolio says available, but a near-term manager confirmation is recommended.",
      tone: "warning",
    };
  }

  if (
    yachtfolioCheck?.status === "available" &&
    !needsManagerConfirmation
  ) {
    return {
      label: "High",
      detail:
        "Yachtfolio and the source support availability for this inquiry.",
      tone: "positive",
    };
  }

  if (
    yachtfolioCheck?.status === "booked" ||
    yachtfolioCheck?.status === "unavailable"
  ) {
    return {
      label: "Blocked",
      detail:
        "The recorded Yachtfolio check does not support offering this yacht.",
      tone: "negative",
    };
  }

  return {
    label: needsManagerConfirmation
      ? policy.managed
        ? "Owner approval needed"
        : "Needs confirmation"
      : "Source only",
    detail: needsManagerConfirmation
      ? policy.managed
        ? "The yacht may fit, but owner or Charter Manager approval is still missing."
        : "The source suggests availability, but fresh direct evidence is missing."
      : "Only the connected source is currently supporting availability.",
    tone: needsManagerConfirmation
      ? "warning"
      : "neutral",
  };
}

function buildVerificationEmail(
  match: YachtMatch,
  inquiry: InquiryMatchInput
): {
  subject: string;
  body: string;
} {
  const dates =
    formatDateRange(
      inquiry.startDate,
      inquiry.endDate
    );

  const subject =
    `Availability request · ${match.yacht.name} · ${dates}`;

  const body = [
    "Hi,",
    "",
    `Could you please confirm the current availability of ${match.yacht.name} for the following charter inquiry?`,
    "",
    `Dates: ${dates}`,
    inquiry.destination
      ? `Destination: ${inquiry.destination}`
      : null,
    inquiry.guests !== null
      ? `Guests: ${inquiry.guests}`
      : null,
    inquiry.budgetMin !== null ||
    inquiry.budgetMax !== null
      ? `Budget: ${formatInquiryBudget(inquiry)}`
      : null,
    "",
    "Many thanks.",
  ]
    .filter(
      (line): line is string =>
        line !== null
    )
    .join("\n");

  return {
    subject,
    body,
  };
}

function formatInquiryBudget(
  inquiry: InquiryMatchInput
): string {
  const currency =
    inquiry.currency || "EUR";

  const format = (amount: number | null) => {
    if (amount === null) {
      return "?";
    }

    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString(
        "en-GB"
      )}`;
    }
  };

  if (
    inquiry.budgetMin !== null &&
    inquiry.budgetMax !== null &&
    inquiry.budgetMin === inquiry.budgetMax
  ) {
    return format(inquiry.budgetMin);
  }

  return `${format(
    inquiry.budgetMin
  )} – ${format(
    inquiry.budgetMax
  )}`;
}

function EvidenceCard({
  eyebrow,
  title,
  detail,
  tone,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  tone:
    | "positive"
    | "warning"
    | "negative"
    | "neutral";
}) {
  const toneClass = {
    positive:
      "border-emerald-500/20 bg-emerald-500/[0.07]",
    warning:
      "border-amber-500/20 bg-amber-500/[0.07]",
    negative:
      "border-red-500/20 bg-red-500/[0.07]",
    neutral:
      "border-border bg-background/45",
  }[tone];

  const titleClass = {
    positive:
      "text-emerald-800 dark:text-emerald-200",
    warning:
      "text-amber-800 dark:text-amber-200",
    negative:
      "text-red-700 dark:text-red-200",
    neutral:
      "text-foreground",
  }[tone];

  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 ${toneClass}`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {eyebrow}
      </p>

      <p
        className={`mt-1 truncate text-xs font-semibold ${titleClass}`}
      >
        {title}
      </p>

      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function MatchMetric({
  icon,
  value,
}: {
  icon: ReactNode;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function getLatestCheck(
  checks: AvailabilityCheck[],
  sources: AvailabilityCheckSource[]
): AvailabilityCheck | null {
  return (
    checks
      .filter((check) =>
        sources.includes(check.source)
      )
      .sort(
        (left, right) =>
          new Date(right.checkedAt).getTime() -
          new Date(left.checkedAt).getTime()
      )[0] ?? null
  );
}

function getEffectiveAvailability(
  checks: AvailabilityCheck[]
): AvailabilityCheck | null {
  const manager =
    getLatestCheck(checks, [
      "manager_email",
      "manager_manual",
    ]);

  if (manager) {
    return manager;
  }

  const yachtfolio =
    getLatestCheck(checks, ["yachtfolio"]);

  if (yachtfolio) {
    return yachtfolio;
  }

  return getLatestCheck(checks, [
    "management_calendar",
    "other",
  ]);
}

function shouldRecommendManagerConfirmation(
  startDate: string | null,
  managerCheck: AvailabilityCheck | null
): boolean {
  if (!startDate) {
    return false;
  }

  const start =
    new Date(`${startDate}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const now = new Date();
  const daysUntilStart =
    (start.getTime() - now.getTime()) /
    86_400_000;

  if (
    daysUntilStart < 0 ||
    daysUntilStart > 60
  ) {
    return false;
  }

  if (!managerCheck) {
    return true;
  }

  const checkedAt =
    new Date(managerCheck.checkedAt);

  if (Number.isNaN(checkedAt.getTime())) {
    return true;
  }

  const ageHours =
    (now.getTime() - checkedAt.getTime()) /
    3_600_000;

  if (daysUntilStart <= 30) {
    return ageHours > 24;
  }

  return ageHours > 72;
}

function statusTone(
  status:
    | AvailabilityCheckStatus
    | undefined
): "positive" | "warning" | "negative" | "neutral" {
  if (status === "available") {
    return "positive";
  }

  if (
    status === "booked" ||
    status === "unavailable"
  ) {
    return "negative";
  }

  if (
    status === "option" ||
    status === "pending"
  ) {
    return "warning";
  }

  return "neutral";
}

function formatStatus(
  status: AvailabilityCheckStatus
): string {
  const labels: Record<
    AvailabilityCheckStatus,
    string
  > = {
    available: "Available",
    booked: "Booked",
    option: "Option",
    unavailable: "Unavailable",
    pending: "Confirmation pending",
  };

  return labels[status];
}

function sourceLabel(
  source: AvailabilityCheckSource
): string {
  const labels: Record<
    AvailabilityCheckSource,
    string
  > = {
    yachtfolio: "Yachtfolio",
    manager_email: "Charter Manager",
    manager_manual: "Manager confirmation",
    management_calendar: "Management calendar",
    other: "Other source",
  };

  return labels[source];
}

function formatRelativeTime(
  value: string
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const seconds =
    Math.round(
      (Date.now() - date.getTime()) / 1000
    );

  if (seconds < 60) {
    return "just now";
  }

  const minutes =
    Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.round(hours / 24);

  if (days < 14) {
    return `${days}d ago`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function buildVerificationRequest(
  match: YachtMatch,
  inquiry: InquiryMatchInput
): string {
  const dates =
    formatDateRange(
      inquiry.startDate,
      inquiry.endDate
    );

  const details = [
    `Yacht: ${match.yacht.name}`,
    `Dates: ${dates}`,
    inquiry.destination
      ? `Destination: ${inquiry.destination}`
      : null,
    inquiry.guests !== null
      ? `Guests: ${inquiry.guests}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Subject: Availability request · ${match.yacht.name} · ${dates}`,
    "",
    `Hi, could you please confirm the current availability of ${match.yacht.name} for the following charter inquiry?`,
    "",
    details,
    "",
    "Many thanks.",
  ].join("\n");
}

function buildRankedMatches(
  records: AvailabilityRecord[],
  inquiry: InquiryMatchInput
): YachtMatch[] {
  const grouped =
    new Map<string, AvailabilityRecord[]>();

  for (const record of records) {
    if (
      !record.yacht ||
      record.status !== "available"
    ) {
      continue;
    }

    const current =
      grouped.get(record.yacht.id) ?? [];

    current.push(record);
    grouped.set(record.yacht.id, current);
  }

  return [...grouped.values()]
    .map((windows) => {
      const first = windows[0];
      const yacht = first.yacht!;

      const priced = windows
        .filter(
          (
            record
          ): record is AvailabilityRecord & {
            weeklyRate: number;
          } =>
            typeof record.weeklyRate ===
              "number" &&
            Number.isFinite(
              record.weeklyRate
            )
        )
        .sort(
          (left, right) =>
            left.weeklyRate -
            right.weeklyRate
        );

      const weeklyRate =
        priced[0]?.weeklyRate ??
        yacht.weeklyRateLow ??
        yacht.weeklyRateHigh ??
        null;

      const currency =
        priced[0]?.currency ??
        yacht.currency ??
        inquiry.currency ??
        "EUR";

      const score =
        scoreMatch(
          yacht,
          windows,
          weeklyRate,
          inquiry
        );

      return {
        yacht,
        sourceName:
          first.source?.name ?? null,
        weeklyRate,
        currency,
        availableFrom:
          formatShortDate(
            inquiry.startDate ??
              first.startDate
          ),
        availableTo:
          formatShortDate(
            inquiry.endDate ??
              first.endDate
          ),
        route: formatRoute(windows),
        score: score.score,
        reasons: score.reasons,
        warnings: score.warnings,
      };
    })
    .sort((left, right) => {
      if (
        right.score !== left.score
      ) {
        return (
          right.score - left.score
        );
      }

      if (
        left.weeklyRate === null &&
        right.weeklyRate !== null
      ) {
        return 1;
      }

      if (
        left.weeklyRate !== null &&
        right.weeklyRate === null
      ) {
        return -1;
      }

      return (
        (left.weeklyRate ?? 0) -
        (right.weeklyRate ?? 0)
      );
    });
}

function scoreMatch(
  yacht: YachtRecord,
  windows: AvailabilityRecord[],
  weeklyRate: number | null,
  inquiry: InquiryMatchInput
) {
  let score = 100;

  const reasons: string[] = [
    "Available for the complete charter window",
  ];

  const warnings: string[] = [];

  const guestCapacity =
    getGuestCapacity(yacht);

  if (
    inquiry.guests !== null &&
    guestCapacity !== null
  ) {
    if (
      guestCapacity >= inquiry.guests
    ) {
      score += 30;
      reasons.push(
        `Fits ${inquiry.guests} guests`
      );
    } else {
      score -= 120;
      warnings.push(
        `Capacity is ${guestCapacity}, below ${inquiry.guests} guests`
      );
    }
  } else if (
    inquiry.guests !== null
  ) {
    warnings.push(
      "Guest capacity is not recorded"
    );
  }

  if (weeklyRate !== null) {
    if (
      inquiry.budgetMax !== null &&
      weeklyRate <= inquiry.budgetMax
    ) {
      score += 25;
      reasons.push(
        "Within the stated budget"
      );
    } else if (
      inquiry.budgetMax !== null &&
      weeklyRate > inquiry.budgetMax
    ) {
      score -= 20;
      warnings.push(
        "Weekly rate is above budget"
      );
    }

    if (
      inquiry.budgetMin !== null &&
      inquiry.budgetMax !== null &&
      weeklyRate >= inquiry.budgetMin &&
      weeklyRate <= inquiry.budgetMax
    ) {
      score += 10;
    }
  } else {
    warnings.push(
      "Rate is on request"
    );
  }

  const destination =
    normalizeText(
      inquiry.destination
    );

  if (destination) {
    const searchableDestination =
      normalizeText(
        [
          yacht.homePort,
          ...yacht.cruisingRegions,
          ...windows.flatMap(
            (window) => [
              window.location,
              window.region,
              window.embarkationPort,
              window.disembarkationPort,
            ]
          ),
        ]
          .filter(Boolean)
          .join(" ")
      );

    if (
      searchableDestination &&
      destination
        .split(/\s+/)
        .some(
          (word) =>
            word.length >= 4 &&
            searchableDestination.includes(
              word
            )
        )
    ) {
      score += 25;
      reasons.push(
        "Destination or route match"
      );
    } else {
      warnings.push(
        "Destination match is not confirmed"
      );
    }
  }

  const preferences =
    normalizeText(
      inquiry.preferences
    );

  if (preferences) {
    const yachtDescription =
      normalizeText(
        [
          yacht.name,
          yacht.yachtType,
          yacht.builder,
          yacht.model,
        ]
          .filter(Boolean)
          .join(" ")
      );

    const preferenceWords =
      preferences
        .split(/\s+/)
        .filter(
          (word) =>
            word.length >= 4
        );

    const matchedPreferences =
      preferenceWords.filter(
        (word) =>
          yachtDescription.includes(
            word
          )
      );

    if (
      matchedPreferences.length > 0
    ) {
      score += Math.min(
        matchedPreferences.length * 5,
        20
      );

      reasons.push(
        "Matches recorded preferences"
      );
    }
  }

  return {
    score,
    reasons,
    warnings,
  };
}

function getGuestCapacity(
  yacht: YachtRecord
): number | null {
  return (
    yacht.sleepingGuests ??
    yacht.guestCapacity ??
    null
  );
}

function formatRoute(
  windows: AvailabilityRecord[]
): string | null {
  const routed =
    windows.find(
      (window) =>
        window.embarkationPort ||
        window.disembarkationPort ||
        window.location ||
        window.region
    );

  if (!routed) {
    return null;
  }

  if (
    routed.embarkationPort &&
    routed.disembarkationPort
  ) {
    return `${routed.embarkationPort} → ${routed.disembarkationPort}`;
  }

  return (
    routed.embarkationPort ??
    routed.disembarkationPort ??
    routed.location ??
    routed.region ??
    null
  );
}

function normalizeText(
  value: string | null
): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatMoney(
  amount: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency:
          currency || "EUR",
        maximumFractionDigits: 0,
      }
    ).format(amount);
  } catch {
    return `${
      currency || "EUR"
    } ${amount.toLocaleString(
      "en-GB"
    )}`;
  }
}

function formatShortDate(
  value: string
): string {
  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    }
  ).format(date);
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string {
  if (
    !startDate ||
    !endDate
  ) {
    return "Dates not fully provided";
  }

  return `${formatShortDate(
    startDate
  )} – ${formatShortDate(
    endDate
  )}`;
}