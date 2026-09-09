export const CATEGORY_DEFAULTS: Record<string, string[]> = {
  FLEET_REQUEST_SUBMITTED: ["ADMIN", "OPS_MANAGER"],
  SUPPORT_REQUEST_SUBMITTED: ["ACCOUNTANT", "ACCOUNT_MANAGER", "OPS_MANAGER"],
};
export function withCategoryDefaults<T extends { eventType: string; role: string; enabled: boolean }>(rules: T[]) {
  const defaults = Object.entries(CATEGORY_DEFAULTS).flatMap(([eventType, roles]) => roles
    .filter(role => !rules.some(r => r.eventType === eventType && r.role === role))
    .map(role => ({ eventType, role, enabled: true })));
  return [...rules, ...defaults];
}
