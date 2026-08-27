import { db, schema } from "../db/client";
import type { StageName, EventLevel } from "@shared/types";

export function emitJobEvent(
  jobId: string,
  stage: StageName,
  level: EventLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  db.insert(schema.jobEvents)
    .values({ jobId, ts: new Date(), stage, level, message, data: data ?? null })
    .run();
}
