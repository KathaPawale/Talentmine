import { PageHeader } from "@/components/layout/PageHeader";

export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        This page is being built — coming in an upcoming milestone.
      </div>
    </div>
  );
}
