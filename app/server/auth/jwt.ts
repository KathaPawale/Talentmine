import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";

const SECRET = new TextEncoder().encode(config.JWT_SECRET);
export const SESSION_COOKIE = "leadmine_session";

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: "admin" | "member";
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role === "admin" ? "admin" : "member",
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProd,
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  };
}
