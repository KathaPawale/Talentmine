import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client";
import { config } from "../config";
import { decryptSecret, encryptSecret } from "../lib/crypto";

type TokenRow = typeof schema.googleTokens.$inferSelect;
export type AccessToken = { token: string; googleEmail: string };

const EXPIRY_MARGIN_MS = 5 * 60_000;
const REFRESH_TIMEOUT_MS = 15_000;

// Per-row mutex: concurrent callers share one in-flight refresh instead of
// racing Google (which can invalidate the older access token).
const inflightRefresh = new Map<string, Promise<AccessToken | null>>();

function markRevoked(rowId: string, reason: string): void {
  db.update(schema.googleTokens)
    .set({ status: "revoked", revokedReason: reason, updatedAt: new Date() })
    .where(eq(schema.googleTokens.id, rowId))
    .run();
}

async function refreshRow(row: TokenRow, refreshToken: string): Promise<AccessToken | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (body.includes("invalid_grant")) {
      markRevoked(row.id, "invalid_grant");
      return null;
    }
    throw new Error(`google token refresh failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  db.update(schema.googleTokens)
    .set({
      accessTokenEnc: encryptSecret(data.access_token),
      accessExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.googleTokens.id, row.id))
    .run();
  return { token: data.access_token, googleEmail: row.googleEmail };
}

export async function getAccessToken(
  purpose: "sheets" | "gmail_sender",
  userId?: string,
): Promise<AccessToken | null> {
  // gmail_sender is a single global grant (userId IS NULL); sheets is per-user.
  const where =
    purpose === "gmail_sender"
      ? and(isNull(schema.googleTokens.userId), eq(schema.googleTokens.purpose, purpose))
      : userId
        ? and(eq(schema.googleTokens.userId, userId), eq(schema.googleTokens.purpose, purpose))
        : null;
  if (!where) return null;

  const row = db.select().from(schema.googleTokens).where(where).get();
  if (!row || row.status === "revoked") return null;

  const accessToken = decryptSecret(row.accessTokenEnc);
  const refreshToken = decryptSecret(row.refreshTokenEnc);

  if (row.accessExpiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) {
    return { token: accessToken, googleEmail: row.googleEmail };
  }

  if (!refreshToken) {
    // Grant was stored without a refresh token — it cannot be renewed.
    markRevoked(row.id, "invalid_grant");
    return null;
  }

  const pending = inflightRefresh.get(row.id);
  if (pending) return pending;
  const p = refreshRow(row, refreshToken).finally(() => inflightRefresh.delete(row.id));
  inflightRefresh.set(row.id, p);
  return p;
}
