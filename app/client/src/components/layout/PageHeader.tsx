import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { InfoCallout } from "@/components/shared/InfoCallout";
import { PAGE_INFO } from "@/lib/pageInfo";

export function PageHeader({
  title,
  description,
  actions,
  infoKey,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Override the pageInfo lookup key (defaults to current route). */
  infoKey?: string;
}) {
  const [location] = useLocation();
  const info = PAGE_INFO[infoKey ?? location];
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {info && <InfoCallout title={info.title}>{info.body}</InfoCallout>}
    </div>
  );
}
