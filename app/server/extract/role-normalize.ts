import { ROLE_CATEGORIES, type RoleCategory } from "@shared/types";

/**
 * Cheap deterministic title → canonical role category mapping. First match
 * wins; order matters (e.g. "accounting manager" should hit accountant before
 * manager). Titles that miss every pattern go to the LLM batch.
 */
const RULES: [RegExp, RoleCategory][] = [
  [/account(ant|ing)|bookkeep|auditor|audit\b|tax\b|payroll|accounts (payable|receivable)|\bcpa\b|\bca\b/i, "accountant"],
  [/financ|treasur|\bcfo\b|controller|fp&a|para[- ]?planner|investment|credit analyst|underwrit/i, "finance"],
  [/\bhr\b|human resources|recruit(er|ment)|talent acquisition|people (ops|operations|partner)|payroll & hr/i, "hr"],
  [/lawyer|attorney|legal|counsel|paralegal|compliance officer/i, "legal"],
  [/nurse|doctor|physician|medical|clinic|dental|pharma(cist)?|therapist|caregiver|health\b/i, "healthcare"],
  [/software|developer|programmer|frontend|backend|full[- ]?stack|devops|\bqa\b|data (engineer|scientist)|machine learning|\bai\b engineer/i, "engineering"],
  [/\bit\b|sysadmin|system administrator|network (engineer|admin)|help ?desk|support engineer|cybersecurity|security analyst|database admin/i, "it"],
  [/market(ing|er)|\bseo\b|content (writer|creator|strategist)|social media|brand|growth|copywriter|public relations|\bpr\b/i, "marketing"],
  [/sales|business development|account (executive|manager)|\bbdr\b|\bsdr\b|revenue/i, "sales"],
  [/customer (service|support|success|care)|call cent(er|re)|client (service|support)/i, "customer_service"],
  [/logisti|supply chain|warehouse|procurement|shipping|fleet|dispatch|inventory/i, "logistics"],
  [/operations|\bops\b|production (manager|supervisor)|plant manager|facility|quality (control|assurance)/i, "operations"],
  [/admin(istrat(or|ive))?|office (manager|assistant)|receptionist|secretary|executive assistant|data entry|clerk/i, "admin"],
  [/manager|director|head of|\bceo\b|\bcoo\b|\bvp\b|vice president|supervisor|team lead|chief\b/i, "manager"],
];

export function roleCategoryFromTitle(title: string): RoleCategory | null {
  for (const [re, category] of RULES) {
    if (re.test(title)) return category;
  }
  return null;
}

/** JSON schema handed to the LLM for batch title normalization. */
export function roleBatchSchema(count: number): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      categories: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: { type: "string", enum: [...ROLE_CATEGORIES] },
      },
    },
    required: ["categories"],
  };
}

export function isRoleCategory(v: unknown): v is RoleCategory {
  return typeof v === "string" && (ROLE_CATEGORIES as readonly string[]).includes(v);
}
