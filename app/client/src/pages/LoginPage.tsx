import { lazy, Suspense } from "react";
import { Orbit } from "lucide-react";

const ParticleField = lazy(() => import("@/components/three/ParticleField"));

export function LoginPage() {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden">
      <Suspense fallback={<div className="glow-hero absolute inset-0" />}>
        <ParticleField />
      </Suspense>
      <div className="glass-panel relative z-10 w-full max-w-sm rounded-2xl p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
          <Orbit className="h-7 w-7 text-primary" />
        </div>
        <h1 className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-2xl font-bold text-transparent">
          TalentMine
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mine talent demand worldwide — find companies hiring for the roles you care about, minus
          the recruiters.
        </p>
        <a
          href="/api/auth/google"
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1H12v3.2h5.3c-.5 2.5-2.6 3.9-5.3 3.9a5.9 5.9 0 1 1 0-11.8c1.5 0 2.8.5 3.9 1.5l2.4-2.4A9.4 9.4 0 0 0 12 2.6a9.4 9.4 0 1 0 0 18.8c4.7 0 9-3.4 9-9.4 0-.63-.07-1.25-.65-1.9Z"
            />
          </svg>
          Continue with Google
        </a>
        <p className="mt-4 text-xs text-muted-foreground/70">
          In development, DEV_AUTH_BYPASS=true signs you in automatically.
        </p>
      </div>
    </div>
  );
}
