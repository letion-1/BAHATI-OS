export type CompanyOperatingModel =
  | "independent_brokerage"
  | "yacht_management"
  | "controlled_fleet"
  | "mixed_operation";

export type YachtAccessType =
  | "controlled"
  | "managed"
  | "broker_access"
  | "reference";

export type CalendarAuthority =
  | "our_company"
  | "owner"
  | "charter_manager"
  | "operator"
  | "unknown";

export type BookingModel =
  | "direct"
  | "confirmation_required"
  | "owner_approval_required"
  | "reference_only";

export type ProposalConfirmationType =
  | "internal_confirmation"
  | "owner_approval"
  | "manager_confirmation"
  | "reference_only";

export type ProposalConfirmationStatus =
  | "not_started"
  | "confirmation_required"
  | "confirmation_requested"
  | "owner_approval_pending"
  | "manager_confirmation_pending"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled"
  | "blocked";

export type FinalApprovalDecisionInput = {
  operatingModel?: CompanyOperatingModel | null;
  accessType?: YachtAccessType | string | null;
  calendarAuthority?: CalendarAuthority | string | null;
  bookingModel?: BookingModel | string | null;
};

export type FinalApprovalDecision = {
  confirmationType: ProposalConfirmationType;
  initialStatus: ProposalConfirmationStatus;
  canProceed: boolean;
  title: string;
  description: string;
  primaryActionLabel: string | null;
  reason: string;
};

export function resolveFinalApprovalDecision(
  input: FinalApprovalDecisionInput
): FinalApprovalDecision {
  const accessType = normalizeAccessType(input.accessType);
  const calendarAuthority = normalizeCalendarAuthority(
    input.calendarAuthority
  );
  const bookingModel = normalizeBookingModel(input.bookingModel);
  const operatingModel = normalizeOperatingModel(
    input.operatingModel
  );

  // Hard stop: reference yachts are informational only.
  if (
    accessType === "reference" ||
    bookingModel === "reference_only"
  ) {
    return {
      confirmationType: "reference_only",
      initialStatus: "blocked",
      canProceed: false,
      title: "Reference yacht",
      description:
        "This yacht is available for reference or presentation only. Bahari OS cannot operationally confirm it for charter.",
      primaryActionLabel: null,
      reason:
        "The yacht access profile or booking model marks this yacht as reference-only.",
    };
  }

  // Booking model is the strongest explicit signal.
  if (bookingModel === "owner_approval_required") {
    return ownerApprovalDecision(
      "The yacht booking model explicitly requires owner approval."
    );
  }

  if (bookingModel === "direct") {
    if (
      accessType === "broker_access" ||
      calendarAuthority === "charter_manager" ||
      calendarAuthority === "operator"
    ) {
      return managerConfirmationDecision(
        "The yacht is externally controlled even though its booking model is direct."
      );
    }

    return internalConfirmationDecision(
      "The yacht booking model allows direct confirmation."
    );
  }

  // Access relationship is the next strongest signal.
  if (accessType === "controlled") {
    if (calendarAuthority === "owner") {
      return ownerApprovalDecision(
        "The yacht is controlled, but the calendar authority is the owner."
      );
    }

    if (
      calendarAuthority === "charter_manager" ||
      calendarAuthority === "operator"
    ) {
      return managerConfirmationDecision(
        "The yacht is controlled, but final calendar authority is external."
      );
    }

    return internalConfirmationDecision(
      "The company controls the yacht and no external approval authority is required."
    );
  }

  if (accessType === "managed") {
    if (
      calendarAuthority === "our_company" &&
      bookingModel === "confirmation_required"
    ) {
      return internalConfirmationDecision(
        "The company manages the yacht and holds the relevant confirmation authority."
      );
    }

    return ownerApprovalDecision(
      "Managed yachts default to owner approval unless the company clearly holds direct confirmation authority."
    );
  }

  if (accessType === "broker_access") {
    return managerConfirmationDecision(
      "Broker-access yachts require confirmation from the external charter manager or operator."
    );
  }

  // If the relationship is incomplete, calendar authority still gives us
  // a useful operational signal.
  if (calendarAuthority === "owner") {
    return ownerApprovalDecision(
      "The yacht access type is incomplete, but calendar authority belongs to the owner."
    );
  }

  if (
    calendarAuthority === "charter_manager" ||
    calendarAuthority === "operator"
  ) {
    return managerConfirmationDecision(
      "The yacht access type is incomplete, but calendar authority is external."
    );
  }

  if (calendarAuthority === "our_company") {
    return internalConfirmationDecision(
      "The yacht access type is incomplete, but the company holds calendar authority."
    );
  }

  // Onboarding model is a default only. It never overrides explicit yacht data.
  switch (operatingModel) {
    case "controlled_fleet":
      return internalConfirmationDecision(
        "No yacht-level approval rule was available, so Bahari OS used the company's controlled-fleet onboarding model as the default."
      );

    case "yacht_management":
      return ownerApprovalDecision(
        "No yacht-level approval rule was available, so Bahari OS used the company's yacht-management onboarding model as the default."
      );

    case "independent_brokerage":
      return managerConfirmationDecision(
        "No yacht-level approval rule was available, so Bahari OS used the company's independent-brokerage onboarding model as the default."
      );

    case "mixed_operation":
    default:
      return managerConfirmationDecision(
        "The yacht-level relationship is incomplete. Bahari OS uses the safer external-confirmation path until the yacht access profile is classified."
      );
  }
}

function internalConfirmationDecision(
  reason: string
): FinalApprovalDecision {
  return {
    confirmationType: "internal_confirmation",
    initialStatus: "confirmation_required",
    canProceed: true,
    title: "Final availability confirmation",
    description:
      "Your company can confirm this yacht internally before the charter proceeds to contract.",
    primaryActionLabel: "Confirm charter availability",
    reason,
  };
}

function ownerApprovalDecision(
  reason: string
): FinalApprovalDecision {
  return {
    confirmationType: "owner_approval",
    initialStatus: "confirmation_required",
    canProceed: true,
    title: "Owner approval required",
    description:
      "The client's preferred yacht requires owner approval before the charter can be treated as confirmed.",
    primaryActionLabel: "Request owner approval",
    reason,
  };
}

function managerConfirmationDecision(
  reason: string
): FinalApprovalDecision {
  return {
    confirmationType: "manager_confirmation",
    initialStatus: "confirmation_required",
    canProceed: true,
    title: "Manager confirmation required",
    description:
      "The client's preferred yacht requires final confirmation from the charter manager or operator.",
    primaryActionLabel: "Request final confirmation",
    reason,
  };
}

function normalizeOperatingModel(
  value: unknown
): CompanyOperatingModel | null {
  switch (value) {
    case "independent_brokerage":
    case "yacht_management":
    case "controlled_fleet":
    case "mixed_operation":
      return value;
    default:
      return null;
  }
}

function normalizeAccessType(
  value: unknown
): YachtAccessType | null {
  switch (value) {
    case "controlled":
    case "managed":
    case "broker_access":
    case "reference":
      return value;
    default:
      return null;
  }
}

function normalizeCalendarAuthority(
  value: unknown
): CalendarAuthority | null {
  switch (value) {
    case "our_company":
    case "owner":
    case "charter_manager":
    case "operator":
    case "unknown":
      return value;
    default:
      return null;
  }
}

function normalizeBookingModel(
  value: unknown
): BookingModel | null {
  switch (value) {
    case "direct":
    case "confirmation_required":
    case "owner_approval_required":
    case "reference_only":
      return value;
    default:
      return null;
  }
}