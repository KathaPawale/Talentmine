import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers/_app";
import { createContext } from "./auth/context";
import { registerGoogleOAuthRoutes } from "./auth/googleOAuth";
import { config } from "./config";

export async function createApp(): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  // Platform health probe — no auth, no DB work.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, env: config.NODE_ENV, uptime: Math.round(process.uptime()) });
  });

  registerGoogleOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path: p }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[trpc] ${p ?? "?"}:`, error.cause ?? error);
        }
      },
    }),
  );

  if (config.isDev) {
    const { createServer: createViteServer } = await import("vite");
    const { readFile } = await import("node:fs/promises");
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "custom",
    });
    // Vite middleware mode does not consistently install its HTML fallback.
    // Transform index.html explicitly so direct visits to client-side routes
    // such as /postings and /companies work in development too.
    app.use(async (req, res, next) => {
      const wantsHtml =
        req.method === "GET" &&
        req.headers.accept?.includes("text/html") === true &&
        !path.extname(req.path);
      if (!wantsHtml || req.path.startsWith("/api/") || req.path.startsWith("/@")) return next();
      try {
        const indexPath = path.resolve(process.cwd(), "client/index.html");
        const template = await readFile(indexPath, "utf8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).type("html").send(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(dist));
    // SPA fallback for client-side routes (Express 5 wildcard syntax)
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  return app;
}
