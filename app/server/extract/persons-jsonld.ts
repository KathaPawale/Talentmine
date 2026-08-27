/** Extract schema.org Person entries from parsed JSON-LD blocks. */

export interface JsonLdPerson {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  sameAs?: string[];
}

function isPersonType(type: unknown): boolean {
  if (typeof type === "string") return type === "Person" || type.endsWith("/Person");
  if (Array.isArray(type)) return type.some((t) => isPersonType(t));
  return false;
}

function asCleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  return s.length > 0 ? s : undefined;
}

function asStringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map(asCleanString).filter((v): v is string => v !== undefined);
}

const MAX_DEPTH = 8;

function walk(node: unknown, out: JsonLdPerson[], seen: Set<object>, depth: number): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, seen, depth + 1);
    return;
  }

  const obj = node as Record<string, unknown>;
  if (isPersonType(obj["@type"])) {
    const name = asCleanString(obj.name);
    let email = asCleanString(obj.email);
    if (email?.toLowerCase().startsWith("mailto:")) email = email.slice(7);
    email = email?.toLowerCase();
    if (email && !email.includes("@")) email = undefined;
    const title = asCleanString(obj.jobTitle);
    const phone = asCleanString(obj.telephone);
    const sameAs = asStringArray(obj.sameAs);
    if (name && (email || title)) {
      const person: JsonLdPerson = { name };
      if (title) person.title = title;
      if (email) person.email = email;
      if (phone) person.phone = phone;
      if (sameAs.length > 0) person.sameAs = sameAs;
      out.push(person);
    }
  }
  for (const value of Object.values(obj)) walk(value, out, seen, depth + 1);
}

export function personsFromJsonLd(blocks: unknown[]): JsonLdPerson[] {
  const found: JsonLdPerson[] = [];
  const seen = new Set<object>();
  for (const block of blocks) walk(block, found, seen, 0);

  const deduped: JsonLdPerson[] = [];
  const keys = new Set<string>();
  for (const p of found) {
    const key = `${p.name.toLowerCase()}|${p.email ?? ""}`;
    if (keys.has(key)) continue;
    keys.add(key);
    deduped.push(p);
  }
  return deduped;
}
