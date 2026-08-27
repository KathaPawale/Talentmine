import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Radar,
  Building2,
  BriefcaseBusiness,
  FileSpreadsheet,
  Settings,
  Orbit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** also highlight for sub-routes with this prefix */
  prefix?: string;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Mining",
    items: [
      { href: "/runs", label: "Mining Runs", icon: Radar, prefix: "/runs" },
      { href: "/postings", label: "Job Postings", icon: BriefcaseBusiness },
      { href: "/companies", label: "Companies", icon: Building2 },
    ],
  },
  {
    label: "Output",
    items: [{ href: "/export", label: "Export", icon: FileSpreadsheet }],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar() {
  const [location] = useLocation();
  return (
    <aside className="glass-panel flex h-full w-60 shrink-0 flex-col border-r border-border">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Orbit className="h-4.5 w-4.5 text-primary" />
        </div>
        <span className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-lg font-bold tracking-tight text-transparent">
          TalentMine
        </span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  location === item.href ||
                  (item.prefix ? location.startsWith(item.prefix + "/") : false);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-slate-400 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
