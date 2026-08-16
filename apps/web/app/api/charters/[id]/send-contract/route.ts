import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import {
  getValidGoogleAccessToken,
  sendGmailMessageWithAttachment,
} from "@/lib/email/google";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "documents";

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

type DeliveryTarget =
  | "client"
  | "yacht_side"
  | "both";

type CharterRow = {
  id: string;
  proposal_id: string;
  fleet_id: string | null;
  reference: string;
  client_name: string;
  client_email: string | null;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  contract_status: string;
  contract_sent_at: string | null;
};

type YachtContactRow = {
  id: string;
  management_company: string | null;
  contact_name: string | null;
  role: string;
  email: string;
};

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  storage_path: string;
  mime_type: string;
  version: number;
};

type ConnectionRow = {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  email_address: string;
  status: string;
};

type DeliveryRecipient = {
  kind: "client" | "yacht_side";
  toEmail: string;
  toName: string;
  managerContactId: string | null;
};

type DeliveryResult = {
  kind: "client" | "yacht_side";
  success: boolean;
  email: string;
  name: string;
  draftId: string | null;
  messageId: string | null;
  error: string | null;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const charterId =
      await readCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const readiness =
      await loadDeliveryReadiness({
        admin,
        companyId:
          workspace.companyId,
        charterId,
      });

    if (!readiness.charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        delivery: {
          client: {
            name:
              readiness.charter
                .client_name,
            email:
              readiness.charter
                .client_email,
            available:
              Boolean(
                readiness.charter
                  .client_email
              ),
          },
          yachtSide:
            readiness.contact
              ? {
                  name:
                    readiness.contact
                      .contact_name ??
                    readiness.contact
                      .management_company ??
                    readiness.contact
                      .role,
                  email:
                    readiness.contact
                      .email,
                  role:
                    readiness.contact
                      .role,
                  managementCompany:
                    readiness.contact
                      .management_company,
                  available: true,
                }
              : {
                  name: null,
                  email: null,
                  role: null,
                  managementCompany:
                    null,
                  available: false,
                },
          document:
            readiness.document
              ? {
                  id:
                    readiness.document.id,
                  name:
                    readiness.document
                      .name,
                  version:
                    readiness.document
                      .version,
                  mimeType:
                    readiness.document
                      .mime_type,
                }
              : null,
          gmail: {
            connected:
              readiness.connection
                ?.status ===
              "connected",
            emailAddress:
              readiness.connection
                ?.email_address ??
              null,
          },
        },
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load contract delivery details."
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await readCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    let body: {
      target?: unknown;
    };

    try {
      body =
        (await request.json()) as {
          target?: unknown;
        };
    } catch {
      return badRequest(
        "The request body must be valid JSON."
      );
    }

    const target =
      readDeliveryTarget(
        body.target
      );

    if (!target) {
      return badRequest(
        "Choose Client, Yacht Side, or Both."
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const readiness =
      await loadDeliveryReadiness({
        admin,
        companyId:
          workspace.companyId,
        charterId,
      });

    const charter =
      readiness.charter;

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      ["declined", "expired", "cancelled"].includes(
        charter.contract_status
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This contract workflow is closed and cannot be sent.",
        },
        {
          status: 409,
        }
      );
    }

    const document =
      readiness.document;

    if (!document) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Generate or upload a Charter Agreement before sending the contract.",
        },
        {
          status: 409,
        }
      );
    }

    const connection =
      readiness.connection;

    if (
      !connection ||
      connection.status !==
        "connected"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Connect Gmail before sending the charter agreement.",
        },
        {
          status: 409,
        }
      );
    }

    const recipients =
      buildRecipients({
        target,
        charter,
        contact:
          readiness.contact,
      });

    if (
      recipients.error
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            recipients.error,
        },
        {
          status: 409,
        }
      );
    }

    const downloadResult =
      await admin.storage
        .from(BUCKET_NAME)
        .download(
          document.storage_path
        );

    if (
      downloadResult.error ||
      !downloadResult.data
    ) {
      throw new Error(
        `Could not load the agreement PDF: ${
          downloadResult.error
            ?.message ??
          "Unknown storage error."
        }`
      );
    }

    const attachmentBuffer =
      Buffer.from(
        await downloadResult.data.arrayBuffer()
      );

    const accessToken =
      await getValidGoogleAccessToken({
        admin,
        connection,
      });

    const results:
      DeliveryResult[] = [];

    for (
      const recipient
      of recipients.value
    ) {
      const email =
        buildContractEmail({
          companyName:
            workspace.companyName ||
            "Yacht OS",
          charter,
          recipient,
          fileName:
            document.name,
        });

      const now =
        new Date().toISOString();

      const draftResult =
        await admin
          .from("email_drafts")
          .insert({
            company_id:
              workspace.companyId,
            inquiry_id:
              charter.proposal_id,
            fleet_id:
              charter.fleet_id,
            manager_contact_id:
              recipient
                .managerContactId,
            purpose: "general",
            to_email:
              recipient.toEmail,
            to_name:
              recipient.toName,
            subject:
              email.subject,
            body:
              email.body,
            start_date:
              charter.start_date,
            end_date:
              charter.end_date,
            status: "draft",
            provider: null,
            created_by:
              workspace.userId,
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single();

      if (
        draftResult.error ||
        !draftResult.data
      ) {
        results.push({
          kind:
            recipient.kind,
          success: false,
          email:
            recipient.toEmail,
          name:
            recipient.toName,
          draftId: null,
          messageId: null,
          error:
            draftResult.error
              ?.message ??
            "Could not create email audit record.",
        });

        continue;
      }

      const draftId =
        String(
          draftResult.data.id
        );

      try {
        const sent =
          await sendGmailMessageWithAttachment({
            accessToken,
            to:
              recipient.toEmail,
            subject:
              email.subject,
            body:
              email.body,
            attachment: {
              fileName:
                document.name,
              mimeType:
                document.mime_type ||
                "application/pdf",
              content:
                attachmentBuffer,
            },
          });

        const sentAt =
          new Date().toISOString();

        const updateDraftResult =
          await admin
            .from("email_drafts")
            .update({
              status: "sent",
              provider: "gmail",
              external_message_id:
                sent.id,
              external_thread_id:
                sent.threadId,
              sent_at: sentAt,
              updated_at:
                sentAt,
            })
            .eq(
              "company_id",
              workspace.companyId
            )
            .eq("id", draftId);

        if (
          updateDraftResult.error
        ) {
          console.error(
            "Contract email sent but draft audit state could not be updated:",
            updateDraftResult.error
          );
        }

        results.push({
          kind:
            recipient.kind,
          success: true,
          email:
            recipient.toEmail,
          name:
            recipient.toName,
          draftId,
          messageId:
            sent.id,
          error: null,
        });
      } catch (sendError) {
        const failedAt =
          new Date().toISOString();

        await admin
          .from("email_drafts")
          .update({
            status: "failed",
            provider: "gmail",
            updated_at:
              failedAt,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq("id", draftId);

        results.push({
          kind:
            recipient.kind,
          success: false,
          email:
            recipient.toEmail,
          name:
            recipient.toName,
          draftId,
          messageId: null,
          error:
            sendError instanceof Error
              ? sendError.message
              : "Gmail could not send this message.",
        });
      }
    }

    const allSucceeded =
      results.length > 0 &&
      results.every(
        (result) =>
          result.success
      );

    const anySucceeded =
      results.some(
        (result) =>
          result.success
      );

    const completedAt =
      new Date().toISOString();

    if (allSucceeded) {
      const charterPatch:
        Record<string, unknown> = {
          contract_sent_at:
            charter.contract_sent_at ??
            completedAt,
          updated_at:
            completedAt,
        };

      if (
        charter.contract_status !==
        "signed"
      ) {
        charterPatch.contract_status =
          "sent";
      }

      const charterUpdate =
        await admin
          .from("charters")
          .update(charterPatch)
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq("id", charterId);

      if (charterUpdate.error) {
        throw new Error(
          `Contract email was sent, but the charter workflow could not be updated: ${charterUpdate.error.message}`
        );
      }
    }

    await admin
      .from("email_connections")
      .update({
        last_used_at:
          completedAt,
        updated_at:
          completedAt,
      })
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq(
        "provider",
        "gmail"
      );

    if (!allSucceeded) {
      const failed =
        results
          .filter(
            (result) =>
              !result.success
          )
          .map(
            (result) =>
              `${labelRecipient(
                result.kind
              )}: ${
                result.error ??
                "send failed"
              }`
          )
          .join(" ");

      return NextResponse.json(
        {
          success: false,
          partial:
            anySucceeded,
          error:
            anySucceeded
              ? `The contract was sent to some recipients, but not all. ${failed}`
              : `The contract could not be sent. ${failed}`,
          results,
        },
        {
          status: 502,
          headers:
            noStoreHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        sender:
          connection.email_address,
        document: {
          id:
            document.id,
          name:
            document.name,
          version:
            document.version,
        },
        results,
        contractStatus:
          charter.contract_status ===
          "signed"
            ? "signed"
            : "sent",
        contractSentAt:
          charter.contract_sent_at ??
          completedAt,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not send charter agreement."
    );
  }
}

async function loadDeliveryReadiness({
  admin,
  companyId,
  charterId,
}: {
  admin: ReturnType<
    typeof createAdminClient
  >;
  companyId: string;
  charterId: string;
}) {
  const charterResult =
    await admin
      .from("charters")
      .select(
        [
          "id",
          "proposal_id",
          "fleet_id",
          "reference",
          "client_name",
          "client_email",
          "yacht_name",
          "start_date",
          "end_date",
          "destination",
          "contract_status",
          "contract_sent_at",
        ].join(",")
      )
      .eq(
        "company_id",
        companyId
      )
      .eq("id", charterId)
      .maybeSingle();

  if (charterResult.error) {
    throw new Error(
      `Could not load charter: ${charterResult.error.message}`
    );
  }

  const charter =
    (charterResult.data ?? null) as CharterRow | null;

  if (!charter) {
    return {
      charter: null,
      contact: null,
      document: null,
      connection: null,
    };
  }

  const [
    documentResult,
    contactResult,
    connectionResult,
  ] = await Promise.all([
    admin
      .from("documents")
      .select(
        "id, name, category, storage_path, mime_type, version"
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "charter_id",
        charterId
      )
      .eq(
        "category",
        "charter_agreement"
      )
      .order(
        "version",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle(),

    charter.fleet_id
      ? admin
          .from("yacht_contacts")
          .select(
            "id, management_company, contact_name, role, email"
          )
          .eq(
            "company_id",
            companyId
          )
          .eq(
            "fleet_id",
            charter.fleet_id
          )
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),

    admin
      .from("email_connections")
      .select(
        "id, access_token_encrypted, refresh_token_encrypted, token_expires_at, email_address, status"
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "provider",
        "gmail"
      )
      .maybeSingle(),
  ]);

  if (documentResult.error) {
    throw new Error(
      `Could not load charter agreement: ${documentResult.error.message}`
    );
  }

  if (contactResult.error) {
    throw new Error(
      `Could not load yacht-side contact: ${contactResult.error.message}`
    );
  }

  if (connectionResult.error) {
    throw new Error(
      `Could not load Gmail connection: ${connectionResult.error.message}`
    );
  }

  return {
    charter,
    document:
      (documentResult.data ?? null) as DocumentRow | null,
    contact:
      (contactResult.data ?? null) as YachtContactRow | null,
    connection:
      (connectionResult.data ?? null) as ConnectionRow | null,
  };
}

function buildRecipients({
  target,
  charter,
  contact,
}: {
  target:
    DeliveryTarget;
  charter:
    CharterRow;
  contact:
    YachtContactRow | null;
}):
  | {
      value:
        DeliveryRecipient[];
      error: null;
    }
  | {
      value: [];
      error: string;
    } {
  const value:
    DeliveryRecipient[] = [];

  if (
    target === "client" ||
    target === "both"
  ) {
    if (
      !charter.client_email
    ) {
      return {
        value: [],
        error:
          "The client does not have an email address on this charter.",
      };
    }

    value.push({
      kind: "client",
      toEmail:
        charter.client_email,
      toName:
        charter.client_name,
      managerContactId: null,
    });
  }

  if (
    target === "yacht_side" ||
    target === "both"
  ) {
    if (!contact?.email) {
      return {
        value: [],
        error:
          "No yacht-side contact is saved for this yacht. Add the owner, owner representative, or Charter Manager contact first.",
      };
    }

    value.push({
      kind: "yacht_side",
      toEmail:
        contact.email,
      toName:
        contact.contact_name ??
        contact.management_company ??
        contact.role,
      managerContactId:
        contact.id,
    });
  }

  return {
    value,
    error: null,
  };
}

function buildContractEmail({
  companyName,
  charter,
  recipient,
  fileName,
}: {
  companyName: string;
  charter: CharterRow;
  recipient:
    DeliveryRecipient;
  fileName: string;
}) {
  const dateRange =
    formatDateRange(
      charter.start_date,
      charter.end_date
    );

  if (
    recipient.kind ===
    "client"
  ) {
    return {
      subject:
        `Charter Agreement | ${charter.yacht_name} | ${charter.reference}`,
      body: [
        `Dear ${recipient.toName},`,
        "",
        `Please find attached the Charter Agreement for ${charter.yacht_name}.`,
        "",
        `Charter reference: ${charter.reference}`,
        `Charter period: ${dateRange}`,
        charter.destination
          ? `Destination: ${charter.destination}`
          : null,
        "",
        "Please review the attached agreement and return the executed copy through your broker.",
        "",
        `Kind regards,`,
        companyName,
        "",
        `Attachment: ${fileName}`,
      ]
        .filter(
          (line) =>
            line !== null
        )
        .join("\n"),
    };
  }

  return {
    subject:
      `Charter Agreement | ${charter.yacht_name} | ${charter.reference}`,
    body: [
      `Dear ${recipient.toName},`,
      "",
      `Please find attached the Charter Agreement for ${charter.yacht_name} and the confirmed charter details for your review, countersignature or records as applicable.`,
      "",
      `Charter reference: ${charter.reference}`,
      `Charterer: ${charter.client_name}`,
      `Charter period: ${dateRange}`,
      charter.destination
        ? `Destination: ${charter.destination}`
        : null,
      "",
      "Please coordinate any required execution or final documentation with the broker.",
      "",
      `Kind regards,`,
      companyName,
      "",
      `Attachment: ${fileName}`,
    ]
      .filter(
        (line) =>
          line !== null
      )
      .join("\n"),
  };
}

async function readCharterId(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return (
    params.id?.trim() ||
    null
  );
}

function readDeliveryTarget(
  value: unknown
): DeliveryTarget | null {
  return (
    value === "client" ||
    value === "yacht_side" ||
    value === "both"
  )
    ? value
    : null;
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "To be confirmed";
  }

  return `${formatDate(
    start
  )} to ${formatDate(end)}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "To be confirmed";
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T12:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  );
}

function labelRecipient(
  kind:
    | "client"
    | "yacht_side"
) {
  return kind === "client"
    ? "Client"
    : "Yacht side";
}

function badRequest(
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 400,
    }
  );
}

function noStoreHeaders() {
  return {
    "Cache-Control":
      "private, no-store, max-age=0",
  };
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (
    isAuthenticationRequiredError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status:
          error.status,
      }
    );
  }

  if (
    isWorkspaceAccessError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status:
          error.status,
      }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Charter contract delivery error:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 500,
    }
  );
}