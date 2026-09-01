const { pathToFileURL } = require("node:url");

let appPromise;

function configureVercelEnvironment() {
  process.env.NODE_ENV = "production";
  // Public guest mode is intentional for this deployment. Override any stale
  // Vercel environment value left from the previous Google-login setup.
  process.env.AUTH_DISABLED = "true";
  process.env.DATABASE_PATH ??= "/tmp/talentmine.db";

  const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (!process.env.APP_URL && hostname) process.env.APP_URL = `https://${hostname}`;
}

async function loadApp() {
  // The build creates one complete ESM server artifact. Loading it after the
  // runtime defaults are set avoids extensionless TypeScript import failures.
  const modulePath = require.resolve("../app/dist/server/vercel.mjs");
  const { createVercelApp } = await import(pathToFileURL(modulePath).href);
  return createVercelApp();
}

module.exports = async function handler(request, response) {
  configureVercelEnvironment();
  try {
    appPromise ??= loadApp();
    const app = await appPromise;
    app(request, response);
  } catch (error) {
    appPromise = undefined;
    console.error("[vercel] application initialization failed", error);
    if (!response.headersSent) {
      response.status(500).json({ error: "Application initialization failed" });
    }
  }
};
