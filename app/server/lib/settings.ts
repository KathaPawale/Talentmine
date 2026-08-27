import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { SETTING_DEFAULTS, type SettingKey } from "@shared/types";

/**
 * SETTING_DEFAULTS is `as const`, so a default of `true` types that key as the
 * literal `true` and a default of `75` as `75`. Widen primitives so callers can
 * store any boolean/number/string for the key.
 */
type Widen<T> = T extends boolean ? boolean : T extends number ? number : T extends string ? string : T;
export type SettingValue<K extends SettingKey> = Widen<(typeof SETTING_DEFAULTS)[K]>;

export function getSetting<K extends SettingKey>(key: K): SettingValue<K> {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (!row) return SETTING_DEFAULTS[key] as SettingValue<K>;
  return row.value as SettingValue<K>;
}

export function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  updatedBy?: string,
): void {
  db.insert(schema.settings)
    .values({ key, value, updatedAt: new Date(), updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date(), updatedBy: updatedBy ?? null },
    })
    .run();
}

export function getAllSettings(): Record<string, unknown> {
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of db.select().from(schema.settings).all()) {
    out[row.key] = row.value;
  }
  return out;
}
