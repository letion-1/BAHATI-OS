"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";

import { ContractShareLink } from "@/components/charters/contract-share-link";

type CharterData = {
  id: string;
  proposalId: string;
  confirmationId: string;
  proposalYachtId: string | null;
  fleetId: string | null;
  reference: string;
  client: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  yacht: {
    name: string;
    fleetId: string | null;
  };
  charter: {
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    embarkationPort: string | null;
    disembarkationPort: string | null;
    guests: number | null;
  };
  commercial: {
    currency: string;
    charterFee: number | null;
    vatPercent: number | null;
    vatAmount: number | null;
    apaPercent: number | null;
    apaAmount: number | null;
    depositPercent: number | null;
    depositAmount: number | null;
    balanceAmount: number | null;
    totalContractValue: number | null;
  };
  charterStatus: string;
  contractStatus: string;
  paymentStatus: string;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Payment = {
  id: string;
  paymentType: string;
  label: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  status: string;
  amountPaid: number;
  paidAt: string | null;
  paymentReference: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CharterDocument = {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  fileSize: number;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type CharterResponse = {
  success: boolean;
  charter?: CharterData;
  payments?: Payment[];
  documents?: CharterDocument[];
  error?: string;
};

type GuestSummary = {
  expectedGuests: number | null;
  actualGuests: number;
  remainingProfiles: number | null;
  completeGuests: number;
  inProgressGuests: number;
  incompleteGuests: number;
  averageCompleteness: number;
  manifestReady: boolean;
};

type CharterGuestsResponse = {
  success: boolean;
  summary?: GuestSummary;
  error?: string;
};

type PaymentMutationResponse = {
  success: boolean;
  payment?: Payment;
  paymentStatus?: string;
  deleted?: boolean;
  error?: string;
};

type AgreementGenerationResponse = {
  success: boolean;
  document?: CharterDocument;
  pdfUrl?: string | null;
  version?: number;
  warning?: string | null;
  error?: string;
};

type DocumentUploadResponse = {
  success: boolean;
  document?: CharterDocument;
  contractSigned?: boolean;
  error?: string;
};

type ContractDeliveryTarget =
  | "client"
  | "yacht_side"
  | "both";

type ContractDeliveryReadiness = {
  client: {
    name: string;
    email: string | null;
    available: boolean;
  };
  yachtSide: {
    name: string | null;
    email: string | null;
    role: string | null;
    managementCompany: string | null;
    available: boolean;
  };
  document: {
    id: string;
    name: string;
    version: number;
    mimeType: string;
  } | null;
  gmail: {
    connected: boolean;
    emailAddress: string | null;
  };
};

type ContractDeliveryResponse = {
  success: boolean;
  delivery?: ContractDeliveryReadiness;
  sender?: string;
  contractStatus?: string;
  contractSentAt?: string | null;
  results?: Array<{
    kind: "client" | "yacht_side";
    success: boolean;
    email: string;
    name: string;
    error: string | null;
  }>;
  partial?: boolean;
  error?: string;
};

type CommercialForm = {
  destination: string;
  embarkationPort: string;
  disembarkationPort: string;
  guests: string;
  currency: string;
  charterFee: string;
  vatPercent: string;
  vatAmount: string;
  apaPercent: string;
  apaAmount: string;
  depositPercent: string;
  depositAmount: string;
  balanceAmount: string;
  totalContractValue: string;
};

type PaymentForm = {
  paymentType:
    | "deposit"
    | "balance"
    | "apa"
    | "vat"
    | "other";
  label: string;
  amount: string;
  dueDate: string;
};

export default function CharterWorkspacePage() {
  const params = useParams();

  const charterId = useMemo(() => {
    const value = params?.id;

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value[0] ?? "";
    }

    return "";
  }, [params]);

  const [data, setData] =
    useState<CharterResponse | null>(null);
  const [form, setForm] =
    useState<CommercialForm | null>(null);
  const [paymentForm, setPaymentForm] =
    useState<PaymentForm>({
      paymentType: "deposit",
      label: "",
      amount: "",
      dueDate: "",
    });
  const [showPaymentForm, setShowPaymentForm] =
    useState(false);
  const [isLoading, setIsLoading] =
    useState(true);
  const [isSaving, setIsSaving] =
    useState(false);
  const [workflowBusy, setWorkflowBusy] =
    useState(false);
  const [paymentBusyId, setPaymentBusyId] =
    useState<string | null>(null);
  const [isAddingPayment, setIsAddingPayment] =
    useState(false);
  const [isGeneratingAgreement, setIsGeneratingAgreement] =
    useState(false);
  const [documentBusyId, setDocumentBusyId] =
    useState<string | null>(null);
  const [documentDeleteBusyId, setDocumentDeleteBusyId] =
    useState<string | null>(null);
  const [isUploadingSignedAgreement, setIsUploadingSignedAgreement] =
    useState(false);
  const signedAgreementInputRef =
    useRef<HTMLInputElement | null>(null);
  const [isDeliveryOpen, setIsDeliveryOpen] =
    useState(false);
  const [deliveryTarget, setDeliveryTarget] =
    useState<ContractDeliveryTarget>("both");
  const [deliveryReadiness, setDeliveryReadiness] =
    useState<ContractDeliveryReadiness | null>(null);
  const [isLoadingDelivery, setIsLoadingDelivery] =
    useState(false);
  const [isSendingContract, setIsSendingContract] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [savedMessage, setSavedMessage] =
    useState<string | null>(null);
  const [guestSummary, setGuestSummary] =
    useState<GuestSummary | null>(null);
  const [activeSection, setActiveSection] =
    useState<
      "overview" |
      "commercial" |
      "contract" |
      "payments" |
      "documents"
    >("overview");

  const loadCharter =
    useCallback(async () => {
      if (!charterId) {
        return;
      }

      try {
        setError(null);

        const response = await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as CharterResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "Could not load charter."
          );
        }

        setData(result);
        setForm(
          formFromCharter(
            result.charter
          )
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load charter."
        );
      } finally {
        setIsLoading(false);
      }
    }, [charterId]);

  const loadGuestSummary =
    useCallback(async () => {
      if (!charterId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/guests`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as CharterGuestsResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.summary
        ) {
          setGuestSummary(null);
          return;
        }

        setGuestSummary(
          result.summary
        );
      } catch {
        setGuestSummary(null);
      }
    }, [charterId]);

  useEffect(() => {
    void loadCharter();
    void loadGuestSummary();
  }, [
    loadCharter,
    loadGuestSummary,
  ]);

  useEffect(() => {
    if (isLoading || !data?.charter) {
      return;
    }

    const sectionIds = [
      "overview",
      "commercial",
      "contract",
      "payments",
      "documents",
    ] as const;

    const syncActiveSectionFromHash =
      () => {
        const hash =
          window.location.hash.replace(
            "#",
            ""
          );

        if (
          sectionIds.includes(
            hash as (typeof sectionIds)[number]
          )
        ) {
          setActiveSection(
            hash as (typeof sectionIds)[number]
          );
          return;
        }

        setActiveSection("overview");
      };

    syncActiveSectionFromHash();

    window.addEventListener(
      "hashchange",
      syncActiveSectionFromHash
    );

    return () => {
      window.removeEventListener(
        "hashchange",
        syncActiveSectionFromHash
      );
    };
  }, [isLoading, data?.charter]);

  function goToWorkspaceSection(
    section:
      | "overview"
      | "commercial"
      | "contract"
      | "payments"
      | "documents"
  ) {
    setActiveSection(section);

    const element =
      document.getElementById(section);

    if (!element) {
      return;
    }

    window.history.replaceState(
      null,
      "",
      `#${section}`
    );

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function saveCommercialTerms() {
    if (
      !charterId ||
      !form ||
      isSaving
    ) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSavedMessage(null);

      const result =
        await patchCharter({
          destination:
            blankToNull(
              form.destination
            ),
          embarkationPort:
            blankToNull(
              form.embarkationPort
            ),
          disembarkationPort:
            blankToNull(
              form.disembarkationPort
            ),
          guests:
            numberOrNull(form.guests),
          currency:
            form.currency
              .trim()
              .toUpperCase(),
          charterFee:
            numberOrNull(
              form.charterFee
            ),
          vatPercent:
            numberOrNull(
              form.vatPercent
            ),
          vatAmount:
            numberOrNull(
              form.vatAmount
            ),
          apaPercent:
            numberOrNull(
              form.apaPercent
            ),
          apaAmount:
            numberOrNull(
              form.apaAmount
            ),
          depositPercent:
            numberOrNull(
              form.depositPercent
            ),
          depositAmount:
            numberOrNull(
              form.depositAmount
            ),
          balanceAmount:
            numberOrNull(
              form.balanceAmount
            ),
          totalContractValue:
            numberOrNull(
              form.totalContractValue
            ),
        });

      setData((current) =>
        current
          ? {
              ...current,
              charter: result,
            }
          : {
              success: true,
              charter: result,
              payments: [],
              documents: [],
            }
      );

      setForm(
        formFromCharter(result)
      );
      setSavedMessage(
        "Commercial terms saved."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save commercial terms."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateWorkflow(
    patch: Record<string, string>
  ) {
    if (
      !charterId ||
      workflowBusy
    ) {
      return;
    }

    try {
      setWorkflowBusy(true);
      setError(null);
      setSavedMessage(null);

      const result =
        await patchCharter(patch);

      setData((current) =>
        current
          ? {
              ...current,
              charter: result,
            }
          : current
      );

      setForm(
        formFromCharter(result)
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update contract workflow."
      );
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function addPayment() {
    if (
      !charterId ||
      !data?.charter ||
      isAddingPayment
    ) {
      return;
    }

    const amount =
      numberOrNull(paymentForm.amount);

    if (amount === null) {
      setError(
        "Enter a payment amount."
      );
      return;
    }

    try {
      setIsAddingPayment(true);
      setError(null);
      setSavedMessage(null);

      const response = await fetch(
        `/api/charters/${encodeURIComponent(
          charterId
        )}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            paymentType:
              paymentForm.paymentType,
            label:
              blankToNull(
                paymentForm.label
              ),
            amount,
            currency:
              data.charter.commercial
                .currency,
            dueDate:
              blankToNull(
                paymentForm.dueDate
              ),
          }),
        }
      );

      const result =
        (await response.json()) as PaymentMutationResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.payment
      ) {
        throw new Error(
          result.error ??
            "Could not add payment milestone."
        );
      }

      setData((current) => {
        if (!current?.charter) {
          return current;
        }

        return {
          ...current,
          charter: {
            ...current.charter,
            paymentStatus:
              result.paymentStatus ??
              current.charter
                .paymentStatus,
          },
          payments: [
            ...(current.payments ?? []),
            result.payment!,
          ].sort(comparePayments),
        };
      });

      setPaymentForm({
        paymentType: "deposit",
        label: "",
        amount: "",
        dueDate: "",
      });
      setShowPaymentForm(false);
      setSavedMessage(
        "Payment milestone added."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add payment milestone."
      );
    } finally {
      setIsAddingPayment(false);
    }
  }

  async function updatePayment(
    payment: Payment,
    patch: Record<string, unknown>
  ) {
    if (
      !charterId ||
      paymentBusyId
    ) {
      return;
    }

    try {
      setPaymentBusyId(payment.id);
      setError(null);
      setSavedMessage(null);

      const response = await fetch(
        `/api/charters/${encodeURIComponent(
          charterId
        )}/payments/${encodeURIComponent(
          payment.id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(patch),
        }
      );

      const result =
        (await response.json()) as PaymentMutationResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.payment
      ) {
        throw new Error(
          result.error ??
            "Could not update payment milestone."
        );
      }

      setData((current) => {
        if (!current?.charter) {
          return current;
        }

        return {
          ...current,
          charter: {
            ...current.charter,
            paymentStatus:
              result.paymentStatus ??
              current.charter
                .paymentStatus,
          },
          payments: (
            current.payments ?? []
          ).map((item) =>
            item.id ===
            result.payment!.id
              ? result.payment!
              : item
          ),
        };
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update payment milestone."
      );
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function deletePayment(
    payment: Payment
  ) {
    if (
      !charterId ||
      paymentBusyId
    ) {
      return;
    }

    try {
      setPaymentBusyId(payment.id);
      setError(null);
      setSavedMessage(null);

      const response = await fetch(
        `/api/charters/${encodeURIComponent(
          charterId
        )}/payments/${encodeURIComponent(
          payment.id
        )}`,
        {
          method: "DELETE",
        }
      );

      const result =
        (await response.json()) as PaymentMutationResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not delete payment milestone."
        );
      }

      setData((current) => {
        if (!current?.charter) {
          return current;
        }

        return {
          ...current,
          charter: {
            ...current.charter,
            paymentStatus:
              result.paymentStatus ??
              current.charter
                .paymentStatus,
          },
          payments: (
            current.payments ?? []
          ).filter(
            (item) =>
              item.id !== payment.id
          ),
        };
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not delete payment milestone."
      );
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function openContractDelivery() {
    if (!charterId) {
      return;
    }

    setIsDeliveryOpen(true);
    setIsLoadingDelivery(true);
    setError(null);
    setSavedMessage(null);

    try {
      const response = await fetch(
        `/api/charters/${encodeURIComponent(
          charterId
        )}/send-contract`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as ContractDeliveryResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.delivery
      ) {
        throw new Error(
          result.error ??
            "Could not load contract delivery details."
        );
      }

      setDeliveryReadiness(
        result.delivery
      );

      if (
        result.delivery.client.available &&
        result.delivery.yachtSide.available
      ) {
        setDeliveryTarget("both");
      } else if (
        result.delivery.client.available
      ) {
        setDeliveryTarget("client");
      } else if (
        result.delivery.yachtSide.available
      ) {
        setDeliveryTarget("yacht_side");
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load contract delivery details."
      );
    } finally {
      setIsLoadingDelivery(false);
    }
  }

  async function sendContract() {
    if (
      !charterId ||
      isSendingContract
    ) {
      return;
    }

    try {
      setIsSendingContract(true);
      setError(null);
      setSavedMessage(null);

      const response = await fetch(
        `/api/charters/${encodeURIComponent(
          charterId
        )}/send-contract`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            target:
              deliveryTarget,
          }),
        }
      );

      const result =
        (await response.json()) as ContractDeliveryResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not send charter agreement."
        );
      }

      await loadCharter();

      const recipientLabel =
        deliveryTarget === "both"
          ? "the client and yacht side"
          : deliveryTarget === "client"
            ? "the client"
            : "the yacht side";

      setSavedMessage(
        `Charter Agreement sent to ${recipientLabel} from ${result.sender ?? "the connected Gmail account"}.`
      );

      setIsDeliveryOpen(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not send charter agreement."
      );
    } finally {
      setIsSendingContract(false);
    }
  }

  async function uploadSignedAgreement(
    file: File
  ) {
    if (
      !charterId ||
      !data?.charter ||
      isUploadingSignedAgreement
    ) {
      return;
    }

    try {
      setIsUploadingSignedAgreement(true);
      setError(null);
      setSavedMessage(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "category",
        "charter_agreement"
      );
      formData.append(
        "charterId",
        charterId
      );
      formData.append(
        "proposalId",
        data.charter.proposalId
      );
      formData.append(
        "markContractSigned",
        "true"
      );

      const response = await fetch(
        "/api/documents",
        {
          method: "POST",
          body: formData,
        }
      );

      const result =
        (await response.json()) as DocumentUploadResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.document
      ) {
        throw new Error(
          result.error ??
            "Could not upload signed agreement."
        );
      }

      await loadCharter();

      setSavedMessage(
        "Signed charter agreement uploaded and the contract has been marked signed."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not upload signed agreement."
      );
    } finally {
      setIsUploadingSignedAgreement(false);

      if (
        signedAgreementInputRef.current
      ) {
        signedAgreementInputRef.current.value =
          "";
      }
    }
  }

  async function generateAgreement() {
    if (
      !charterId ||
      isGeneratingAgreement
    ) {
      return;
    }

    try {
      setIsGeneratingAgreement(true);
      setError(null);
      setSavedMessage(null);

      const response = await fetch(
        `/api/charters/${encodeURIComponent(
          charterId
        )}/agreement`,
        {
          method: "POST",
        }
      );

      const result =
        (await response.json()) as AgreementGenerationResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.document
      ) {
        throw new Error(
          result.error ??
            "Could not generate charter agreement."
        );
      }

      await loadCharter();

      setSavedMessage(
        `Charter Agreement v${result.version ?? result.document.version} generated and saved to Documents.`
      );

      if (result.pdfUrl) {
        window.open(
          result.pdfUrl,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not generate charter agreement."
      );
    } finally {
      setIsGeneratingAgreement(false);
    }
  }

  async function openDocument(
    document: CharterDocument
  ) {
    if (documentBusyId) {
      return;
    }

    try {
      setDocumentBusyId(document.id);
      setError(null);

      const response = await fetch(
        `/api/documents/${encodeURIComponent(
          document.id
        )}/download`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          url?: string;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success ||
        !result.url
      ) {
        throw new Error(
          result.error ??
            "Could not open document."
        );
      }

      window.open(
        result.url,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not open document."
      );
    } finally {
      setDocumentBusyId(null);
    }
  }

  async function deleteDocument(
    document: CharterDocument
  ) {
    if (documentDeleteBusyId) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${document.name}? This removes the file from Bahari OS and cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDocumentDeleteBusyId(
        document.id
      );
      setError(null);
      setSavedMessage(null);

      const response = await fetch(
        `/api/documents/${encodeURIComponent(
          document.id
        )}`,
        {
          method: "DELETE",
        }
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not delete document."
        );
      }

      setData((current) =>
        current
          ? {
              ...current,
              documents: (
                current.documents ?? []
              ).filter(
                (item) =>
                  item.id !==
                  document.id
              ),
            }
          : current
      );

      setSavedMessage(
        `${document.name} deleted.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not delete document."
      );
    } finally {
      setDocumentDeleteBusyId(
        null
      );
    }
  }

  async function patchCharter(
    patch: Record<string, unknown>
  ): Promise<CharterData> {
    const response = await fetch(
      `/api/charters/${encodeURIComponent(
        charterId
      )}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(patch),
      }
    );

    const result =
      (await response.json()) as CharterResponse;

    if (
      !response.ok ||
      !result.success ||
      !result.charter
    ) {
      throw new Error(
        result.error ??
          "Could not update charter."
      );
    }

    return result.charter;
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel animate-pulse rounded-[28px] p-6">
          <div className="h-3 w-40 rounded bg-muted" />
          <div className="mt-4 h-10 w-72 rounded bg-muted" />
          <div className="mt-6 h-28 rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  if (
    error &&
    !data?.charter
  ) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-red-800 dark:text-red-200">
          {error}
        </div>
      </main>
    );
  }

  const charter =
    data?.charter ?? null;

  if (!charter || !form) {
    return null;
  }

  const payments =
    data?.payments ?? [];
  const documents =
    data?.documents ?? [];

  const paidAmount =
    payments.reduce(
      (total, payment) =>
        payment.currency ===
        charter.commercial.currency
          ? total + payment.amountPaid
          : total,
      0
    );

  const outstandingAmount =
    charter.commercial
      .totalContractValue !== null
      ? Math.max(
          charter.commercial
            .totalContractValue -
            paidAmount,
          0
        )
      : null;

  const nextAction =
    charter.contractStatus !== "signed"
      ? "Complete the charter contract workflow."
      : charter.paymentStatus !== "paid"
        ? "Review the payment schedule and outstanding balance."
        : charter.charter.guests === null
          ? "Add the confirmed guest count."
          : guestSummary &&
              !guestSummary.manifestReady
            ? guestSummary.expectedGuests !== null
              ? `Complete Guest Intelligence (${guestSummary.actualGuests}/${guestSummary.expectedGuests} profiles created).`
              : "Complete Guest Intelligence and manifest preparation."
            : "Review itinerary and concierge preparations.";

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-panel overflow-hidden rounded-[28px]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                    Charter workspace
                  </p>

                  <StatusBadge
                    value={
                      charter.charterStatus
                    }
                  />

                  <StatusBadge
                    value={
                      charter.contractStatus
                    }
                  />

                  <StatusBadge
                    value={
                      charter.paymentStatus
                    }
                  />
                </div>

                <h1 className="mt-3 font-heading text-3xl tracking-[0.04em] text-foreground sm:text-4xl">
                  {charter.yacht.name}
                </h1>

                <p className="mt-2 text-sm text-muted-foreground">
                  {charter.reference}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Client"
                    value={
                      charter.client.name
                    }
                  />
                  <Metric
                    label="Dates"
                    value={formatDateRange(
                      charter.charter
                        .startDate,
                      charter.charter
                        .endDate
                    )}
                  />
                  <Metric
                    label="Guests"
                    value={
                      guestSummary &&
                      guestSummary.expectedGuests !== null
                        ? `${guestSummary.actualGuests}/${guestSummary.expectedGuests} profiles`
                        : charter.charter
                              .guests !== null
                          ? String(
                              charter.charter
                                .guests
                            )
                          : "Not set"
                    }
                  />
                  <Metric
                    label="Charter fee"
                    value={formatMoney(
                      charter.commercial
                        .charterFee,
                      charter.commercial
                        .currency
                    )}
                  />
                </div>
              </div>

              <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
                <Link
                  href="/charters"
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Back to Charters
                </Link>

                <Link
                  href={`/charters/${encodeURIComponent(
                    charter.id
                  )}/guests`}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Guests
                </Link>

                <Link
                  href={`/concierge/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold"
                >
                  Concierge
                </Link>

                <Link
                  href={`/charters/${encodeURIComponent(
                    charter.id
                  )}/guest-portal`}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Guest Portal
                </Link>

                <Link
                  href={`/itineraries/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Itinerary
                </Link>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {savedMessage ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {savedMessage}
          </div>
        ) : null}

        <nav
          aria-label="Charter workspace sections"
          className="ui-panel sticky top-24 z-20 overflow-x-auto rounded-[24px] p-2 backdrop-blur-xl"
        >
          <div className="flex min-w-max items-center gap-1">
            <a
              href="#overview"
              onClick={(event) => {
                event.preventDefault();
                goToWorkspaceSection(
                  "overview"
                );
              }}
              aria-current={
                activeSection === "overview"
                  ? "location"
                  : undefined
              }
              className={workspaceSectionClass(
                activeSection === "overview"
              )}
            >
              Overview
            </a>
            <a
              href="#commercial"
              onClick={(event) => {
                event.preventDefault();
                goToWorkspaceSection(
                  "commercial"
                );
              }}
              aria-current={
                activeSection === "commercial"
                  ? "location"
                  : undefined
              }
              className={workspaceSectionClass(
                activeSection === "commercial"
              )}
            >
              Commercial
            </a>
            <a
              href="#contract"
              onClick={(event) => {
                event.preventDefault();
                goToWorkspaceSection(
                  "contract"
                );
              }}
              aria-current={
                activeSection === "contract"
                  ? "location"
                  : undefined
              }
              className={workspaceSectionClass(
                activeSection === "contract"
              )}
            >
              Contract
            </a>
            <a
              href="#payments"
              onClick={(event) => {
                event.preventDefault();
                goToWorkspaceSection(
                  "payments"
                );
              }}
              aria-current={
                activeSection === "payments"
                  ? "location"
                  : undefined
              }
              className={workspaceSectionClass(
                activeSection === "payments"
              )}
            >
              Payments
            </a>
            <a
              href="#documents"
              onClick={(event) => {
                event.preventDefault();
                goToWorkspaceSection(
                  "documents"
                );
              }}
              aria-current={
                activeSection === "documents"
                  ? "location"
                  : undefined
              }
              className={workspaceSectionClass(
                activeSection === "documents"
              )}
            >
              Documents
            </a>
            <Link
              href={`/charters/${encodeURIComponent(
                charter.id
              )}/guests`}
              className="apple-transition inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Guests
            </Link>

            <Link
              href={`/itineraries/${encodeURIComponent(
                charter.id
              )}`}
              className="apple-transition inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Itinerary
            </Link>
            <Link
              href={`/concierge/${encodeURIComponent(
                charter.id
              )}`}
              className="apple-transition inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Concierge
            </Link>
            <Link
              href={`/charters/${encodeURIComponent(
                charter.id
              )}/guest-portal`}
              className="apple-transition inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Guest Portal
            </Link>
          </div>
        </nav>

        <section
          id="overview"
          className="ui-panel scroll-mt-28 overflow-hidden rounded-[28px] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                Charter overview
              </p>
              <h2 className="mt-2 font-heading text-2xl text-foreground sm:text-3xl">
                Operational command center
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                A live summary of contract, payment and charter readiness.
              </p>
            </div>

            <StatusBadge
              value={
                charter.charterStatus
              }
            />
          </div>

          <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
              Next action
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {nextAction}
            </p>
          </div>

          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Charter health
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ui-panel-soft rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Contract
                </p>
                <div className="mt-3">
                  <StatusBadge
                    value={
                      charter.contractStatus
                    }
                  />
                </div>
              </div>

              <div className="ui-panel-soft rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Payments
                </p>
                <div className="mt-3">
                  <StatusBadge
                    value={
                      charter.paymentStatus
                    }
                  />
                </div>
              </div>

              <Link
                href={`/charters/${encodeURIComponent(
                  charter.id
                )}/guests`}
                className="ui-panel-soft apple-transition rounded-2xl p-4 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-cyan-500/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Guest Intelligence
                    </p>

                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {guestSummary
                        ? guestSummary.expectedGuests !== null
                          ? `${guestSummary.actualGuests} / ${guestSummary.expectedGuests} profiles`
                          : `${guestSummary.actualGuests} profiles`
                        : charter.charter.guests !== null
                          ? `${charter.charter.guests} expected`
                          : "Open guest profiles"}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {guestSummary
                        ? guestSummary.manifestReady
                          ? "Manifest ready"
                          : `${guestSummary.averageCompleteness}% average readiness`
                        : "Manage manifest readiness"}
                    </p>
                  </div>

                  {guestSummary ? (
                    <span
                      className={
                        guestSummary.manifestReady
                          ? "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-200"
                          : "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-900 dark:text-amber-200"
                      }
                    >
                      {guestSummary.manifestReady
                        ? "Ready"
                        : "Pending"}
                    </span>
                  ) : null}
                </div>
              </Link>

              <div className="ui-panel-soft rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Documents
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {documents.length === 1
                    ? "1 file"
                    : `${documents.length} files`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="ui-panel-soft rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Client
              </p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                {charter.client.name}
              </p>
              <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
                <p>
                  {charter.client.email ??
                    "Email not set"}
                </p>
                <p>
                  {charter.client.phone ??
                    "Phone not set"}
                </p>
              </div>
            </div>

            <div className="ui-panel-soft rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Yacht
              </p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                {charter.yacht.name}
              </p>
              <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
                <p>
                  {charter.charter.destination ??
                    "Destination not set"}
                </p>
                <p>
                  {formatDateRange(
                    charter.charter
                      .startDate,
                    charter.charter
                      .endDate
                  )}
                </p>
              </div>
            </div>

            <div className="ui-panel-soft rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Financial snapshot
              </p>

              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Charter fee
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(
                      charter.commercial
                        .charterFee,
                      charter.commercial
                        .currency
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    APA
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(
                      charter.commercial
                        .apaAmount,
                      charter.commercial
                        .currency
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    VAT
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(
                      charter.commercial
                        .vatAmount,
                      charter.commercial
                        .currency
                    )}
                  </span>
                </div>

                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Paid
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(
                        paidAmount,
                        charter.commercial
                          .currency
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Outstanding
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(
                        outstandingAmount,
                        charter.commercial
                          .currency
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.2fr_0.8fr]">
          <section
            id="commercial"
            className="ui-panel scroll-mt-28 rounded-[28px] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Commercial terms
                </p>
                <h2 className="mt-1.5 font-heading text-xl text-foreground sm:mt-2 sm:text-2xl">
                  Contract economics
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  void saveCommercialTerms()
                }
                disabled={isSaving}
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
              >
                {isSaving
                  ? "Saving..."
                  : "Save terms"}
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field
                label="Destination"
                value={form.destination}
                onChange={(value) =>
                  setForm({
                    ...form,
                    destination: value,
                  })
                }
              />
              <Field
                label="Guests"
                type="number"
                value={form.guests}
                onChange={(value) =>
                  setForm({
                    ...form,
                    guests: value,
                  })
                }
              />
              <Field
                label="Embarkation port"
                value={
                  form.embarkationPort
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    embarkationPort:
                      value,
                  })
                }
              />
              <Field
                label="Disembarkation port"
                value={
                  form.disembarkationPort
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    disembarkationPort:
                      value,
                  })
                }
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Currency"
                value={form.currency}
                onChange={(value) =>
                  setForm({
                    ...form,
                    currency:
                      value.toUpperCase(),
                  })
                }
              />
              <Field
                label="Charter fee"
                type="number"
                value={form.charterFee}
                onChange={(value) =>
                  setForm({
                    ...form,
                    charterFee: value,
                  })
                }
              />
              <Field
                label="Total contract value"
                type="number"
                value={
                  form.totalContractValue
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    totalContractValue:
                      value,
                  })
                }
              />

              <Field
                label="VAT %"
                type="number"
                value={form.vatPercent}
                onChange={(value) =>
                  setForm({
                    ...form,
                    vatPercent: value,
                  })
                }
              />
              <Field
                label="VAT amount"
                type="number"
                value={form.vatAmount}
                onChange={(value) =>
                  setForm({
                    ...form,
                    vatAmount: value,
                  })
                }
              />

              <Field
                label="APA %"
                type="number"
                value={form.apaPercent}
                onChange={(value) =>
                  setForm({
                    ...form,
                    apaPercent: value,
                  })
                }
              />
              <Field
                label="APA amount"
                type="number"
                value={form.apaAmount}
                onChange={(value) =>
                  setForm({
                    ...form,
                    apaAmount: value,
                  })
                }
              />

              <Field
                label="Deposit %"
                type="number"
                value={
                  form.depositPercent
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    depositPercent:
                      value,
                  })
                }
              />
              <Field
                label="Deposit amount"
                type="number"
                value={
                  form.depositAmount
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    depositAmount:
                      value,
                  })
                }
              />
              <Field
                label="Balance amount"
                type="number"
                value={
                  form.balanceAmount
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    balanceAmount:
                      value,
                  })
                }
              />
            </div>

            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Bahari OS stores the terms exactly as the broker enters them. VAT, APA, deposit and balance values are not guessed or auto-imposed.
            </p>
          </section>

          <section
            id="contract"
            className="ui-panel scroll-mt-28 rounded-[28px] p-5 sm:p-6"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Contract
            </p>
            <h2 className="mt-2 font-heading text-2xl text-foreground">
              Workflow
            </h2>

            <div className="mt-5 rounded-2xl border border-border bg-background/45 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  value={
                    charter.contractStatus
                  }
                />
                <StatusBadge
                  value={
                    charter.paymentStatus
                  }
                />
              </div>

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {workflowDescription(
                  charter.contractStatus
                )}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {renderWorkflowAction({
                  status:
                    charter.contractStatus,
                  busy: workflowBusy,
                  onUpdate:
                    updateWorkflow,
                })}

                <button
                  type="button"
                  onClick={() =>
                    void openContractDelivery()
                  }
                  disabled={
                    isLoadingDelivery ||
                    isSendingContract
                  }
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-60"
                >
                  {isLoadingDelivery
                    ? "Loading delivery..."
                    : "Send contract"}
                </button>
              </div>
            </div>

            {isDeliveryOpen ? (
              <div className="mt-4 rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      Contract delivery
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      Choose who receives the attached agreement.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setIsDeliveryOpen(false)
                    }
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>

                {isLoadingDelivery ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Loading recipients...
                  </p>
                ) : deliveryReadiness ? (
                  <>
                    <div className="mt-4 grid gap-2">
                      <DeliveryOption
                        active={
                          deliveryTarget === "client"
                        }
                        disabled={
                          !deliveryReadiness.client.available
                        }
                        title="Client"
                        detail={
                          deliveryReadiness.client.email
                            ? `${deliveryReadiness.client.name} | ${deliveryReadiness.client.email}`
                            : "No client email is saved."
                        }
                        onClick={() =>
                          setDeliveryTarget("client")
                        }
                      />

                      <DeliveryOption
                        active={
                          deliveryTarget === "yacht_side"
                        }
                        disabled={
                          !deliveryReadiness.yachtSide.available
                        }
                        title="Yacht side"
                        detail={
                          deliveryReadiness.yachtSide.email
                            ? `${
                                deliveryReadiness.yachtSide.name ??
                                deliveryReadiness.yachtSide.role ??
                                "Owner / Charter Manager"
                              } | ${deliveryReadiness.yachtSide.email}`
                            : "No owner / Charter Manager contact is saved for this yacht."
                        }
                        onClick={() =>
                          setDeliveryTarget("yacht_side")
                        }
                      />

                      <DeliveryOption
                        active={
                          deliveryTarget === "both"
                        }
                        disabled={
                          !deliveryReadiness.client.available ||
                          !deliveryReadiness.yachtSide.available
                        }
                        title="Both"
                        detail="Send separate tracked emails to the client and yacht side."
                        onClick={() =>
                          setDeliveryTarget("both")
                        }
                      />
                    </div>

                    <div className="mt-4 rounded-xl border border-border bg-background/50 px-3 py-3 text-xs leading-5 text-muted-foreground">
                      <p>
                        Attachment:{" "}
                        <span className="font-semibold text-foreground">
                          {deliveryReadiness.document?.name ??
                            "No Charter Agreement available"}
                        </span>
                      </p>
                      <p className="mt-1">
                        Gmail:{" "}
                        <span className="font-semibold text-foreground">
                          {deliveryReadiness.gmail.connected
                            ? deliveryReadiness.gmail.emailAddress ??
                              "Connected"
                            : "Not connected"}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void sendContract()
                        }
                        disabled={
                          isSendingContract ||
                          !deliveryReadiness.document ||
                          !deliveryReadiness.gmail.connected
                        }
                        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                      >
                        {isSendingContract
                          ? "Sending..."
                          : deliveryTarget === "both"
                            ? "Send to both"
                            : deliveryTarget === "client"
                              ? "Send to client"
                              : "Send to yacht side"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric
                label="Contract sent"
                value={formatDateTime(
                  charter.contractSentAt
                )}
              />
              <Metric
                label="Contract signed"
                value={formatDateTime(
                  charter.contractSignedAt
                )}
              />
            </div>
          </section>
        </div>

        <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-2">
          <section
            id="documents"
            className="ui-panel scroll-mt-28 rounded-[28px] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Documents
                </p>
                <h2 className="mt-2 font-heading text-2xl text-foreground">
                  Charter files
                </h2>
              </div>

              <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void generateAgreement()
                  }
                  disabled={
                    isGeneratingAgreement
                  }
                  className="ui-primary-button apple-transition inline-flex min-h-10 w-full items-center justify-center px-3 py-2 text-xs font-semibold disabled:opacity-60 sm:w-auto"
                >
                  {isGeneratingAgreement
                    ? "Generating..."
                    : "Generate agreement"}
                </button>

                <input
                  ref={
                    signedAgreementInputRef
                  }
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file =
                      event.target.files?.[0];

                    if (file) {
                      void uploadSignedAgreement(
                        file
                      );
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    signedAgreementInputRef.current?.click()
                  }
                  disabled={
                    isUploadingSignedAgreement
                  }
                  className="ui-secondary-button apple-transition inline-flex min-h-10 w-full items-center justify-center px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-60 sm:w-auto"
                >
                  {isUploadingSignedAgreement
                    ? "Uploading..."
                    : "Upload signed agreement"}
                </button>

                <Link
                  href="/documents"
                  className="ui-secondary-button apple-transition inline-flex min-h-10 w-full items-center justify-center px-3 py-2 text-xs font-semibold hover:bg-accent sm:w-auto"
                >
                  Documents
                </Link>
              </div>
            </div>

            {/*
              Sits above the file list rather than below it. A broker who has
              just generated an agreement is looking for how to send it, and
              the answer should not be underneath the thing they already have.
            */}
            <ContractShareLink charterId={charterId} />

            {documents.length > 0 ? (
              <div className="mt-5 space-y-2">
                {documents.map(
                  (document) => (
                    <div
                      key={document.id}
                      className="ui-panel-soft flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[11px] font-semibold leading-4 text-foreground sm:text-sm sm:leading-5">
  {document.name}
</p>
                        <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                          {formatLabel(
                            document.category
                          )}{" "}
                          - v
                          {
                            document.version
                          }
                        </p>
                      </div>

                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:items-center sm:justify-end">
                        <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
                          {formatFileSize(
                            document.fileSize
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            void openDocument(
                              document
                            )
                          }
                          disabled={
                            documentBusyId ===
                              document.id ||
                            documentDeleteBusyId ===
                              document.id
                          }
                          className="ui-secondary-button apple-transition inline-flex min-h-9 w-full items-center justify-center px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60 sm:w-auto"
                        >
                          {documentBusyId ===
                          document.id
                            ? "Opening..."
                            : "View / Download"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void deleteDocument(
                              document
                            )
                          }
                          disabled={
                            documentDeleteBusyId ===
                              document.id ||
                            documentBusyId ===
                              document.id
                          }
                          className="apple-transition inline-flex min-h-9 w-full items-center justify-center rounded-[0.9rem] border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-500/15 disabled:opacity-60 dark:text-red-200 sm:w-auto"
                        >
                          {documentDeleteBusyId ===
                          document.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <EmptyState
                text="No charter documents yet. Generate a Charter Agreement draft or upload the executed signed agreement when it is returned."
              />
            )}
          </section>

          <section
            id="payments"
            className="ui-panel scroll-mt-28 rounded-[28px] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Payments
                  </p>
                  <StatusBadge
                    value={
                      charter.paymentStatus
                    }
                  />
                </div>

                <h2 className="mt-2 font-heading text-2xl text-foreground">
                  Payment schedule
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowPaymentForm(
                    (current) =>
                      !current
                  )
                }
                className="ui-secondary-button apple-transition inline-flex min-h-10 w-full items-center justify-center px-3 py-2 text-xs font-semibold hover:bg-accent sm:w-auto"
              >
                {showPaymentForm
                  ? "Close"
                  : "Add payment"}
              </button>
            </div>

            {showPaymentForm ? (
              <div className="mt-5 rounded-2xl border border-border bg-background/45 p-4">
                <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      Type
                    </span>
                    <select
                      value={
                        paymentForm.paymentType
                      }
                      onChange={(event) =>
                        setPaymentForm({
                          ...paymentForm,
                          paymentType:
                            event.target
                              .value as PaymentForm["paymentType"],
                        })
                      }
                      className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                    >
                      <option value="deposit">
                        Deposit
                      </option>
                      <option value="balance">
                        Balance
                      </option>
                      <option value="apa">
                        APA
                      </option>
                      <option value="vat">
                        VAT
                      </option>
                      <option value="other">
                        Other
                      </option>
                    </select>
                  </label>

                  <Field
                    label="Label"
                    value={
                      paymentForm.label
                    }
                    onChange={(value) =>
                      setPaymentForm({
                        ...paymentForm,
                        label: value,
                      })
                    }
                  />

                  <Field
                    label={`Amount (${charter.commercial.currency})`}
                    type="number"
                    value={
                      paymentForm.amount
                    }
                    onChange={(value) =>
                      setPaymentForm({
                        ...paymentForm,
                        amount: value,
                      })
                    }
                  />

                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      Due date
                    </span>
                    <input
                      type="date"
                      value={
                        paymentForm.dueDate
                      }
                      onChange={(event) =>
                        setPaymentForm({
                          ...paymentForm,
                          dueDate:
                            event.target.value,
                        })
                      }
                      className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      void addPayment()
                    }
                    disabled={
                      isAddingPayment
                    }
                    className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {isAddingPayment
                      ? "Adding..."
                      : "Add milestone"}
                  </button>
                </div>
              </div>
            ) : null}

            {payments.length > 0 ? (
              <div className="mt-5 space-y-3">
                {payments.map(
                  (payment) => {
                    const busy =
                      paymentBusyId ===
                      payment.id;

                    return (
                      <div
                        key={payment.id}
                        className="ui-panel-soft rounded-2xl px-4 py-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {payment.label ??
                                  formatLabel(
                                    payment.paymentType
                                  )}
                              </p>
                              <StatusBadge
                                value={
                                  payment.status
                                }
                              />
                            </div>

                            <p className="mt-2 text-xs text-muted-foreground">
                              Due{" "}
                              {formatDate(
                                payment.dueDate
                              )}
                            </p>

                            <p className="mt-1 text-xs text-muted-foreground">
                              Received{" "}
                              {formatMoney(
                                payment.amountPaid,
                                payment.currency
                              )}{" "}
                              of{" "}
                              {formatMoney(
                                payment.amount,
                                payment.currency
                              )}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-lg font-semibold text-foreground">
                              {formatMoney(
                                payment.amount,
                                payment.currency
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {payment.status !==
                          "paid" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updatePayment(
                                  payment,
                                  {
                                    status:
                                      "paid",
                                  }
                                )
                              }
                              className="ui-primary-button apple-transition inline-flex min-h-10 w-full items-center justify-center px-3 py-2 text-xs font-semibold disabled:opacity-60 sm:w-auto"
                            >
                              {busy
                                ? "Saving..."
                                : "Mark paid"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updatePayment(
                                  payment,
                                  {
                                    status:
                                      "not_due",
                                    amountPaid: 0,
                                  }
                                )
                              }
                              className="ui-secondary-button apple-transition inline-flex min-h-10 items-center justify-center px-3 py-2 text-xs font-semibold disabled:opacity-60"
                            >
                              Undo paid
                            </button>
                          )}

                          {payment.status !==
                            "paid" &&
                          payment.status !==
                            "due" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updatePayment(
                                  payment,
                                  {
                                    status:
                                      "due",
                                  }
                                )
                              }
                              className="ui-secondary-button apple-transition inline-flex min-h-10 items-center justify-center px-3 py-2 text-xs font-semibold disabled:opacity-60"
                            >
                              Mark due
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void deletePayment(
                                payment
                              )
                            }
                            className="apple-transition inline-flex min-h-10 items-center justify-center rounded-[0.9rem] border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-800 disabled:opacity-60 dark:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <EmptyState
                text="No payment schedule has been configured yet. Add deposit, balance, APA, VAT or another payment milestone."
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function workspaceSectionClass(
  active: boolean
) {
  return active
    ? "ui-primary-button apple-transition inline-flex min-h-9 items-center justify-center px-3 py-2 text-xs font-semibold"
    : "apple-transition inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground";
}

function renderWorkflowAction({
  status,
  busy,
  onUpdate,
}: {
  status: string;
  busy: boolean;
  onUpdate: (
    patch: Record<string, string>
  ) => Promise<void>;
}) {
  if (status === "not_started") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void onUpdate({
            contractStatus: "draft",
            charterStatus:
              "contracting",
          })
        }
        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {busy
          ? "Saving..."
          : "Start contract"}
      </button>
    );
  }

  if (status === "draft") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void onUpdate({
            contractStatus: "ready",
          })
        }
        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {busy
          ? "Saving..."
          : "Mark contract ready"}
      </button>
    );
  }

  if (status === "ready") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void onUpdate({
            contractStatus: "sent",
          })
        }
        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {busy
          ? "Saving..."
          : "Mark contract sent"}
      </button>
    );
  }

  if (status === "sent") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void onUpdate({
            contractStatus: "signed",
          })
        }
        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {busy
          ? "Saving..."
          : "Mark contract signed"}
      </button>
    );
  }

  if (status === "signed") {
    return (
      <span className="inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
        Charter contract signed
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        void onUpdate({
          contractStatus: "draft",
          charterStatus:
            "contracting",
        })
      }
      className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
    >
      Reopen as draft
    </button>
  );
}

function DeliveryOption({
  active,
  disabled,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-cyan-500/40 bg-cyan-500/10"
          : "border-border bg-background/40 hover:bg-accent"
      }`}
    >
      <p className="text-sm font-semibold text-foreground">
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {detail}
      </p>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        step={
          type === "number"
            ? "any"
            : undefined
        }
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
      />
    </label>
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
    <div className="ui-panel-soft rounded-xl px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  value,
}: {
  value: string;
}) {
  const positive =
    value === "confirmed" ||
    value === "signed" ||
    value === "paid" ||
    value === "deposit_paid" ||
    value === "completed" ||
    value === "active";

  const caution =
    value === "contracting" ||
    value === "ready" ||
    value === "sent" ||
    value === "due" ||
    value === "deposit_due" ||
    value === "balance_due" ||
    value === "partially_paid";

  const negative =
    value === "cancelled" ||
    value === "declined" ||
    value === "expired" ||
    value === "overdue";

  const className = positive
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
    : caution
      ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : negative
        ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200"
        : "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${className}`}
    >
      {formatLabel(value)}
    </span>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-background/35 px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
      {text}
    </div>
  );
}

function formFromCharter(
  charter: CharterData
): CommercialForm {
  return {
    destination:
      charter.charter.destination ?? "",
    embarkationPort:
      charter.charter.embarkationPort ??
      "",
    disembarkationPort:
      charter.charter
        .disembarkationPort ?? "",
    guests:
      toInputValue(
        charter.charter.guests
      ),
    currency:
      charter.commercial.currency,
    charterFee:
      toInputValue(
        charter.commercial.charterFee
      ),
    vatPercent:
      toInputValue(
        charter.commercial.vatPercent
      ),
    vatAmount:
      toInputValue(
        charter.commercial.vatAmount
      ),
    apaPercent:
      toInputValue(
        charter.commercial.apaPercent
      ),
    apaAmount:
      toInputValue(
        charter.commercial.apaAmount
      ),
    depositPercent:
      toInputValue(
        charter.commercial
          .depositPercent
      ),
    depositAmount:
      toInputValue(
        charter.commercial
          .depositAmount
      ),
    balanceAmount:
      toInputValue(
        charter.commercial
          .balanceAmount
      ),
    totalContractValue:
      toInputValue(
        charter.commercial
          .totalContractValue
      ),
  };
}

function workflowDescription(
  status: string
) {
  const descriptions:
    Record<string, string> = {
      not_started:
        "The yacht is confirmed. Start the contracting process when the commercial terms are ready to be formalized.",
      draft:
        "The contract is being prepared. Review the commercial terms and supporting documents before marking it ready.",
      ready:
        "The contract is ready for the client. Mark it sent once it has actually been delivered.",
      sent:
        "The contract has been sent. Mark it signed only after the executed agreement has been received.",
      signed:
        "The executed charter agreement has been received. The charter is now contractually confirmed.",
      declined:
        "The contract was declined.",
      expired:
        "The contract expired before signature.",
      cancelled:
        "The contracting workflow was cancelled.",
    };

  return (
    descriptions[status] ??
    "Contract workflow status."
  );
}

function comparePayments(
  a: Payment,
  b: Payment
) {
  if (
    a.dueDate &&
    b.dueDate
  ) {
    return a.dueDate.localeCompare(
      b.dueDate
    );
  }

  if (a.dueDate) {
    return -1;
  }

  if (b.dueDate) {
    return 1;
  }

  return a.paymentType.localeCompare(
    b.paymentType
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function formatMoney(
  value: number | null,
  currency: string
) {
  if (value === null) {
    return "Not set";
  }

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }
    ).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(
      "en-GB"
    )}`;
  }
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "Dates not set";
  }

  return `${formatDate(start)} - ${formatDate(end)}`;
}
function formatDate(
  value: string | null
) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(
    `${value}T12:00:00`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Not recorded";
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function formatFileSize(
  bytes: number
) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function numberOrNull(
  value: string
) {
  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function blankToNull(
  value: string
) {
  const cleaned = value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function toInputValue(
  value: number | null
) {
  return value === null
    ? ""
    : String(value);
}