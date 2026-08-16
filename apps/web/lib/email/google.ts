import {
  decryptEmailToken,
  encryptEmailToken,
} from "@/lib/email/token-crypto";

const GOOGLE_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_URL =
  "https://oauth2.googleapis.com/token";

const GOOGLE_USERINFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export const GOOGLE_EMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
];

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type StoredGoogleConnection = {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
};

type SupabaseAdminLike = {
  from: (table: string) => any;
};

type GmailSendResult = {
  id: string;
  threadId: string | null;
};

export function createGoogleEmailAuthorizationUrl(
  state: string
): string {
  const config = getGoogleOAuthConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_EMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleAuthorizationCode(
  code: string
): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig();

  const response = await fetch(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    }
  );

  const payload =
    (await response.json()) as GoogleTokenResponse;

  if (
    !response.ok ||
    !payload.access_token
  ) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Google did not return an access token."
    );
  }

  return payload;
}

export async function getGoogleUserInfo(
  accessToken: string
): Promise<{
  providerAccountId: string;
  email: string;
}> {
  const response = await fetch(
    GOOGLE_USERINFO_URL,
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  const payload =
    (await response.json()) as GoogleUserInfo;

  if (
    !response.ok ||
    !payload.sub ||
    !payload.email
  ) {
    throw new Error(
      "Could not identify the connected Google account."
    );
  }

  return {
    providerAccountId: payload.sub,
    email: payload.email,
  };
}

export async function getValidGoogleAccessToken({
  admin,
  connection,
}: {
  admin: SupabaseAdminLike;
  connection: StoredGoogleConnection;
}): Promise<string> {
  const expiresAt =
    connection.token_expires_at
      ? new Date(
          connection.token_expires_at
        ).getTime()
      : 0;

  const hasUsableAccessToken =
    expiresAt >
    Date.now() + 2 * 60 * 1000;

  if (hasUsableAccessToken) {
    return decryptEmailToken(
      connection.access_token_encrypted
    );
  }

  const refreshToken =
    decryptEmailToken(
      connection.refresh_token_encrypted
    );

  const refreshed =
    await refreshGoogleAccessToken(
      refreshToken
    );

  const accessToken =
    refreshed.access_token!;

  const tokenExpiresAt =
    new Date(
      Date.now() +
        (refreshed.expires_in ?? 3600) *
          1000
    ).toISOString();

  const updateResult = await admin
    .from("email_connections")
    .update({
      access_token_encrypted:
        encryptEmailToken(accessToken),
      token_expires_at:
        tokenExpiresAt,
      status: "connected",
      updated_at:
        new Date().toISOString(),
      last_used_at:
        new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (updateResult.error) {
    throw new Error(
      `Could not store refreshed Google token: ${updateResult.error.message}`
    );
  }

  return accessToken;
}

export async function sendGmailTextMessage({
  accessToken,
  to,
  subject,
  body,
}: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
}): Promise<GmailSendResult> {
  const raw = buildRawEmail({
    to,
    subject,
    body,
  });

  return sendRawGmailMessage({
    accessToken,
    raw,
  });
}

export async function sendGmailMessageWithAttachment({
  accessToken,
  to,
  subject,
  body,
  attachment,
}: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  attachment: {
    fileName: string;
    mimeType: string;
    content: Buffer;
  };
}): Promise<GmailSendResult> {
  const raw =
    buildRawEmailWithAttachment({
      to,
      subject,
      body,
      attachment,
    });

  return sendRawGmailMessage({
    accessToken,
    raw,
  });
}

export async function revokeGoogleToken(
  token: string
): Promise<void> {
  try {
    await fetch(
      "https://oauth2.googleapis.com/revoke",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token,
        }),
        cache: "no-store",
      }
    );
  } catch {
    // Local disconnect still proceeds even if
    // Google revocation is temporarily unavailable.
  }
}

async function sendRawGmailMessage({
  accessToken,
  raw,
}: {
  accessToken: string;
  raw: string;
}): Promise<GmailSendResult> {
  const response = await fetch(
    GMAIL_SEND_URL,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        raw,
      }),
      cache: "no-store",
    }
  );

  const payload =
    (await response.json()) as {
      id?: string;
      threadId?: string;
      error?: {
        message?: string;
      };
    };

  if (
    !response.ok ||
    !payload.id
  ) {
    throw new Error(
      payload.error?.message ??
        "Gmail could not send this message."
    );
  }

  return {
    id: payload.id,
    threadId:
      payload.threadId ?? null,
  };
}

async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig();

  const response = await fetch(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    }
  );

  const payload =
    (await response.json()) as GoogleTokenResponse;

  if (
    !response.ok ||
    !payload.access_token
  ) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Google access expired and could not be refreshed."
    );
  }

  return payload;
}

function getGoogleOAuthConfig() {
  const clientId =
    process.env.GOOGLE_EMAIL_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_EMAIL_CLIENT_SECRET;

  const redirectUri =
    process.env
      .GOOGLE_EMAIL_REDIRECT_URI;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri
  ) {
    throw new Error(
      "Google email OAuth environment variables are incomplete."
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

function buildRawEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): string {
  const safeTo =
    sanitizeHeader(to);

  const encodedSubject =
    encodeMimeHeader(subject);

  const normalizedBody =
    body.replace(/\r?\n/g, "\r\n");

  const message = [
    `To: ${safeTo}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizedBody,
  ].join("\r\n");

  return Buffer.from(
    message,
    "utf8"
  ).toString("base64url");
}

function buildRawEmailWithAttachment({
  to,
  subject,
  body,
  attachment,
}: {
  to: string;
  subject: string;
  body: string;
  attachment: {
    fileName: string;
    mimeType: string;
    content: Buffer;
  };
}): string {
  const boundary =
    `yachtos_${crypto.randomUUID().replace(/-/g, "")}`;

  const safeTo =
    sanitizeHeader(to);

  const encodedSubject =
    encodeMimeHeader(subject);

  const safeFileName =
    sanitizeAttachmentFileName(
      attachment.fileName
    );

  const normalizedBody =
    body.replace(/\r?\n/g, "\r\n");

  const bodyBase64 =
    wrapBase64(
      Buffer.from(
        normalizedBody,
        "utf8"
      ).toString("base64")
    );

  const attachmentBase64 =
    wrapBase64(
      attachment.content.toString(
        "base64"
      )
    );

  const message = [
    `To: ${safeTo}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyBase64,
    `--${boundary}`,
    `Content-Type: ${sanitizeMimeType(
      attachment.mimeType
    )}; name="${safeFileName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeFileName}"`,
    "",
    attachmentBase64,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(
    message,
    "utf8"
  ).toString("base64url");
}

function wrapBase64(
  value: string
): string {
  return (
    value.match(/.{1,76}/g)?.join(
      "\r\n"
    ) ?? ""
  );
}

function sanitizeHeader(
  value: string
): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function sanitizeAttachmentFileName(
  value: string
): string {
  const cleaned = value
    .replace(/[\r\n"]/g, "")
    .trim()
    .replace(
      /[^a-zA-Z0-9._ -]+/g,
      "-"
    )
    .slice(0, 120);

  return cleaned || "document.pdf";
}

function sanitizeMimeType(
  value: string
): string {
  const cleaned = value
    .trim()
    .toLowerCase();

  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(
    cleaned
  )
    ? cleaned
    : "application/octet-stream";
}

function encodeMimeHeader(
  value: string
): string {
  const safe =
    value.replace(/[\r\n]+/g, " ").trim();

  if (/^[\x20-\x7E]*$/.test(safe)) {
    return safe;
  }

  return `=?UTF-8?B?${Buffer.from(
    safe,
    "utf8"
  ).toString("base64")}?=`;
}