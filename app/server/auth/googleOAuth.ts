import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "../db/client";
import { config } from "../config";
import { encryptSecret, newId } from "../lib/crypto";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "./jwt";

// One OAuth client, three flows distinguished by a signed `state` JWT:
//   login        — openid email profile (no refresh token needed)
//   sheets       — per-user Sheets scope, offline access
//   gmail_sender — one-time global sender grant (admin, as bd.report@...)
export type OAuthFlow = "login" | "sheets" | "gmail_sender";

const STATE_SECRET = new TextEncoder().encode(config.JWT_SECRET + ":oauth-state");
const REDIRECT_PATH = "/api/google/callback";

const FLOW_SCOPES: Record<OAuthFlow, string[]> = {
  login: ["openid", "email", "profile"],
  sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  gmail_sender: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
};

async function signState(flow: OAuthFlow, userId?: string): Promise<string> {
  return new SignJWT({ flow, userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(STATE_SECRET);
}

async function verifyState(state: string): Promise<{ flow: OAuthFlow; userId?: string } | null> {
  try {
    const { payload } = await jwtVerify(state, STATE_SECRET);
    const flow = payload.flow as OAuthFlow;
    if (!["login", "sheets", "gmail_sender"].includes(flow)) return null;
    return { flow, userId: typeof payload.userId === "string" ? payload.userId : undefined };
  } catch {
    return null;
  }
}

export function buildAuthUrl(flow: OAuthFlow, state: string): string {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: `${config.APP_URL}${REDIRECT_PATH}`,
    response_type: "code",
    scope: FLOW_SCOPES[flow].join(" "),
    state,
  });
  if (flow !== "login") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  }
  if (flow === "login" && config.GOOGLE_ALLOWED_DOMAIN) {
    params.set("hd", config.GOOGLE_ALLOWED_DOMAIN); // UI hint only; verified server-side below
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${config.APP_URL}${REDIRECT_PATH}`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

/** Decode (without re-verifying signature — it came from Google over TLS) the ID token payload. */
function decodeIdToken(idToken: string): Record<string, unknown> {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

function storeToken(opts: {
  userId: string | null;
  purpose: "sheets" | "gmail_sender";
  googleEmail: string;
  tokens: TokenResponse;
}): void {
  const now = new Date();
  const existing = db
    .select()
    .from(schema.googleTokens)
    .where(
      opts.userId === null
        ? and(isNull(schema.googleTokens.userId), eq(schema.googleTokens.purpose, opts.purpose))
        : and(eq(schema.googleTokens.userId, opts.userId), eq(schema.googleTokens.purpose, opts.purpose)),
    )
    .get();

  const values = {
    googleEmail: opts.googleEmail,
    accessTokenEnc: encryptSecret(opts.tokens.access_token),
    refreshTokenEnc: encryptSecret(opts.tokens.refresh_token ?? ""),
    scopes: opts.tokens.scope ?? "",
    accessExpiresAt: new Date(Date.now() + opts.tokens.expires_in * 1000),
    status: "active" as const,
    revokedReason: null,
    updatedAt: now,
  };

  if (existing) {
    // Keep the old refresh token if Google didn't return a new one
    if (!opts.tokens.refresh_token) {
      const { refreshTokenEnc: _drop, ...rest } = values;
      db.update(schema.googleTokens).set(rest).where(eq(schema.googleTokens.id, existing.id)).run();
    } else {
      db.update(schema.googleTokens).set(values).where(eq(schema.googleTokens.id, existing.id)).run();
    }
  } else {
    db.insert(schema.googleTokens)
      .values({ id: newId(), userId: opts.userId, purpose: opts.purpose, createdAt: now, ...values })
      .run();
  }
}

export function registerGoogleOAuthRoutes(app: Express): void {
  app.get("/api/auth/google", async (_req: Request, res: Response) => {
    if (!config.features.googleAuth) {
      res.status(503).send("Google OAuth is not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.");
      return;
    }
    res.redirect(buildAuthUrl("login", await signState("login")));
  });

  // Connect flows are started from the app via tRPC google.getAuthUrl; these
  // direct routes exist so a plain link also works.
  app.get("/api/google/connect-sheets", async (req: Request, res: Response) => {
    const userId = (req as Request & { authedUserId?: string }).authedUserId;
    res.redirect(buildAuthUrl("sheets", await signState("sheets", userId)));
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code ?? "");
      const stateRaw = String(req.query.state ?? "");
      const state = await verifyState(stateRaw);
      if (!code || !state) {
        res.status(400).send("Invalid OAuth state or code.");
        return;
      }

      const tokens = await exchangeCode(code);

      if (state.flow === "login") {
        if (!tokens.id_token) throw new Error("missing id_token in login flow");
        const claims = decodeIdToken(tokens.id_token);
        const email = String(claims.email ?? "").toLowerCase();
        const hd = String(claims.hd ?? "");
        if (config.GOOGLE_ALLOWED_DOMAIN && hd !== config.GOOGLE_ALLOWED_DOMAIN) {
          res
            .status(403)
            .send(`Sign-in is restricted to @${config.GOOGLE_ALLOWED_DOMAIN} accounts.`);
          return;
        }
        const now = new Date();
        let user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
        if (!user) {
          const isFirstUser = db.select().from(schema.users).all().length === 0;
          db.insert(schema.users)
            .values({
              id: newId(),
              googleSub: String(claims.sub ?? ""),
              email,
              name: String(claims.name ?? email),
              pictureUrl: typeof claims.picture === "string" ? claims.picture : null,
              role: isFirstUser ? "admin" : "member",
              createdAt: now,
              lastLoginAt: now,
            })
            .run();
          user = db.select().from(schema.users).where(eq(schema.users.email, email)).get()!;
        } else {
          db.update(schema.users)
            .set({ lastLoginAt: now, name: String(claims.name ?? user.name) })
            .where(eq(schema.users.id, user.id))
            .run();
        }
        const session = await signSession({
          sub: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });
        res.cookie(SESSION_COOKIE, session, sessionCookieOptions());
        res.redirect("/");
        return;
      }

      // sheets / gmail_sender connect flows
      // Identify the granting Google account for display.
      let googleEmail = "";
      if (tokens.id_token) {
        googleEmail = String(decodeIdToken(tokens.id_token).email ?? "");
      } else {
        const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (info.ok) googleEmail = String(((await info.json()) as { email?: string }).email ?? "");
      }

      if (state.flow === "sheets") {
        if (!state.userId) {
          res.status(400).send("Missing user for Sheets connect. Start the flow from Settings.");
          return;
        }
        storeToken({ userId: state.userId, purpose: "sheets", googleEmail, tokens });
        res.redirect("/settings?connected=sheets");
        return;
      }

      storeToken({ userId: null, purpose: "gmail_sender", googleEmail, tokens });
      res.redirect("/settings?connected=sender");
    } catch (err) {
      console.error("[oauth] callback error:", err);
      res.status(500).send("OAuth callback failed. Check server logs.");
    }
  });
}
