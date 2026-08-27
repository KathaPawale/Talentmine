import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, type EmptyStateProps } from "./EmptyState";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  rowKey,
  onRowClick,
  empty,
  skeletonRows = 5,
}: {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  isLoading: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty: EmptyStateProps;
  skeletonRows?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  "px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                {columns.map((col) => (
                  <td key={col.id} className={cn("px-4 py-3", col.className)}>
                    <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
                  </td>
                ))}
              </tr>
            ))
          ) : !data || data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-4">
                <EmptyState {...empty} />
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  onRowClick && "cursor-pointer transition-colors hover:bg-muted/40",
                )}
              >
                {columns.map((col) => (
                  <td key={col.id} className={cn("px-4 py-3", col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
