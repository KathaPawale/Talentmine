type ServerApp = Awaited<ReturnType<typeof import("../app/server/app").createApp>>;
type Request = Parameters<ServerApp>[0];
type Response = Parameters<ServerApp>[1];

let appPromise: ReturnType<typeof import("../app/server/vercel").createVercelApp> | undefined;

function configureVercelEnvironment(): void {
  process.env.NODE_ENV = "production";
  process.env.AUTH_DISABLED ??= "false";
  process.env.DATABASE_PATH ??= "/tmp/talentmine.db";

  const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (!process.env.APP_URL && hostname) process.env.APP_URL = `https://${hostname}`;

}

export default async function handler(req: Request, res: Response): Promise<void> {
  configureVercelEnvironment();
  appPromise ??= import("../app/server/vercel").then(({ createVercelApp }) => createVercelApp());
  const app = await appPromise;
  app(req, res);
}
