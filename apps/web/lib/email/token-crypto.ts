import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_VERSION = "v1";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  companyId: string;
  userId: string;
  returnTo: string;
  issuedAt: number;
  nonce: string;
};

export function encryptEmailToken(
  plaintext: string
): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);

  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    iv
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptEmailToken(
  encrypted: string
): string {
  const [
    version,
    ivValue,
    tagValue,
    ciphertextValue,
  ] = encrypted.split(".");

  if (
    version !== TOKEN_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    throw new Error(
      "Stored email token has an unsupported format."
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url")
  );

  decipher.setAuthTag(
    Buffer.from(tagValue, "base64url")
  );

  const plaintext = Buffer.concat([
    decipher.update(
      Buffer.from(
        ciphertextValue,
        "base64url"
      )
    ),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function createEmailOAuthState({
  companyId,
  userId,
  returnTo = "/email",
}: {
  companyId: string;
  userId: string;
  returnTo?: string;
}): string {
  const safeReturnTo = normalizeReturnTo(
    returnTo
  );

  const payload: OAuthStatePayload = {
    companyId,
    userId,
    returnTo: safeReturnTo,
    issuedAt: Date.now(),
    nonce: randomBytes(18).toString(
      "base64url"
    ),
  };

  const encoded = Buffer.from(
    JSON.stringify(payload),
    "utf8"
  ).toString("base64url");

  const signature = signState(encoded);

  return `${encoded}.${signature}`;
}

export function verifyEmailOAuthState(
  state: string
): OAuthStatePayload {
  const [encoded, signature] =
    state.split(".");

  if (!encoded || !signature) {
    throw new Error(
      "OAuth state is missing or malformed."
    );
  }

  const expected = signState(encoded);

  const providedBuffer = Buffer.from(
    signature
  );

  const expectedBuffer = Buffer.from(
    expected
  );

  if (
    providedBuffer.length !==
      expectedBuffer.length ||
    !timingSafeEqual(
      providedBuffer,
      expectedBuffer
    )
  ) {
    throw new Error(
      "OAuth state signature is invalid."
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(
      Buffer.from(
        encoded,
        "base64url"
      ).toString("utf8")
    );
  } catch {
    throw new Error(
      "OAuth state payload is invalid."
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error(
      "OAuth state payload is invalid."
    );
  }

  const record = payload as Record<
    string,
    unknown
  >;

  const companyId =
    typeof record.companyId === "string"
      ? record.companyId
      : "";

  const userId =
    typeof record.userId === "string"
      ? record.userId
      : "";

  const returnTo =
    typeof record.returnTo === "string"
      ? normalizeReturnTo(
          record.returnTo
        )
      : "/email";

  const issuedAt =
    typeof record.issuedAt === "number"
      ? record.issuedAt
      : 0;

  const nonce =
    typeof record.nonce === "string"
      ? record.nonce
      : "";

  if (
    !companyId ||
    !userId ||
    !issuedAt ||
    !nonce
  ) {
    throw new Error(
      "OAuth state is incomplete."
    );
  }

  if (
    Date.now() - issuedAt >
    OAUTH_STATE_MAX_AGE_MS
  ) {
    throw new Error(
      "OAuth state has expired. Start the connection again."
    );
  }

  return {
    companyId,
    userId,
    returnTo,
    issuedAt,
    nonce,
  };
}

function getEncryptionKey(): Buffer {
  const raw =
    process.env
      .EMAIL_TOKEN_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY is not configured."
    );
  }

  let key: Buffer;

  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY must be base64."
    );
  }

  if (key.length !== 32) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes."
    );
  }

  return key;
}

function getStateSecret(): string {
  const secret =
    process.env.EMAIL_OAUTH_STATE_SECRET;

  if (!secret) {
    throw new Error(
      "EMAIL_OAUTH_STATE_SECRET is not configured."
    );
  }

  return secret;
}

function signState(
  encodedPayload: string
): string {
  return createHmac(
    "sha256",
    getStateSecret()
  )
    .update(encodedPayload)
    .digest("base64url");
}

function normalizeReturnTo(
  value: string
): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/email";
  }

  return value;
}