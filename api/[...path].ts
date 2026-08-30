import { createHash } from "node:crypto";

type ServerApp = Awaited<ReturnType<typeof import("../app/server/app").createApp>>;
type Request = Parameters<ServerApp>[0];
type Response = Parameters<ServerApp>[1];

let appPromise: ReturnType<typeof import("../app/server/vercel").createVercelApp> | undefined;

function configureVercelEnvironment(): void {
  process.env.NODE_ENV = "production";
  process.env.AUTH_DISABLED ??= "true";
  process.env.DATABASE_PATH ??= "/tmp/talentmine.db";

  const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (!process.env.APP_URL && hostname) process.env.APP_URL = `https://${hostname}`;

  // Public-link mode does not use signed sessions or stored provider tokens,
  // but the shared config schema still requires both values. Derive per-deploy
  // fallbacks instead of committing credentials to source control.
  const deployId = process.env.VERCEL_DEPLOYMENT_ID ?? hostname ?? "talentmine-vercel";
  process.env.JWT_SECRET ??= createHash("sha256").update(`session:${deployId}`).digest("hex");
  process.env.TOKEN_ENCRYPTION_KEY ??= createHash("sha256")
    .update(`tokens:${deployId}`)
    .digest("hex");
}

export default async function handler(req: Request, res: Response): Promise<void> {
  configureVercelEnvironment();
  appPromise ??= import("../app/server/vercel").then(({ createVercelApp }) => createVercelApp());
  const app = await appPromise;
  app(req, res);
}
