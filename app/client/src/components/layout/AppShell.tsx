import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { Sidebar } from "./Sidebar";
import { StatusPill } from "@/components/shared/StatusPill";

export function AppShell({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: me } = useQuery(trpc.auth.me.queryOptions());
  const { data: health } = useQuery(trpc.system.health.queryOptions(undefined, { staleTime: 60_000 }));

  const logout = async () => {
    // plain fetch avoids importing the mutation machinery just for logout
    await fetch("/api/trpc/auth.logout?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "0": { json: null } }),
    });
    qc.clear();
    window.location.href = "/";
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-foreground/80">TalentMine</span>
            <span>/</span>
            <span>Talent Demand Workspace</span>
          </div>
          <div className="flex items-center gap-3">
            {health?.simulate && (
              <StatusPill tone="info" label="Simulate mode — sample data" size="sm" />
            )}
            {me?.devBypass && !me.authDisabled && <StatusPill tone="info" label="Dev mode" size="sm" />}
            {me && !me.authDisabled && (
              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <div className="text-xs font-medium leading-tight">{me.name}</div>
                  <div className="text-[11px] leading-tight text-muted-foreground">{me.email}</div>
                </div>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="bg-grid min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
