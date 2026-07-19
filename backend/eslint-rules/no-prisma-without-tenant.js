/**
 * ESLint rule: no-prisma-without-tenant
 *
 * Catches `prisma.<scopedModel>.<readOrBulkOp>(...)` calls whose `where`
 * clause does not include a `tenantId` filter. Mirrors the runtime
 * `hasTenantFilter` semantics from `backend/src/config/prismaExtensions.ts`
 * so the static check and the runtime guard stay in lock-step.
 *
 * Static enforcement complements:
 *   - prismaExtensions.ts: warn-or-throw at runtime
 *   - tenantScope middleware: AsyncLocalStorage(tenantId) on every request
 *
 * REQ-tenant-scoped-everything (Phase 1, Wave 0).
 *
 * The rule fires only on tenant-scoped models (TENANT_SCOPED_MODELS — kept
 * in sync with `prismaExtensions.ts::TENANT_SCOPED_MODELS` PLUS the 5 new
 * Phase 1 models: AgentAction, AgentMemory, PinnedView, PerformanceSnapshot,
 * MetricEvent).
 *
 * To deliberately bypass for legitimate global-admin queries, use:
 *   // eslint-disable-next-line no-prisma-without-tenant
 *   const all = await prisma.driver.findMany({ where: { ... } });
 */

"use strict";

// Tenant-scoped models — must remain in sync with
// `backend/src/config/prismaExtensions.ts::TENANT_SCOPED_MODELS`.
// The 5 trailing entries are the Phase 1 NEW models (Wave 1 ships them).
const TENANT_SCOPED_MODELS = new Set([
  "Driver",
  "Company",
  "Vehicle",
  "Shift",
  "AttendanceRecord",
  "OrderLog",
  "CashRecord",
  "CashTransaction",
  "PendingDuesLedger",
  "DriverRestriction",
  "DriverInventory",
  "LeaveRequest",
  "Ticket",
  "Alert",
  "AiDigest",
  "AuditLog",
  "MaintenanceRecord",
  "VehicleInspection",
  "Device",
  "DeviceCommand",
  "KpiDefinition",
  "KpiRecord",
  "TalabatSession",
  "TalabatDelivery",
  "TalabatViolationEvent",
  "KeetaDailyMetrics",
  "AmericanaOrder",
  "NotificationRule",
  "Notification",
  "PlatformSettings",
  "AiScore",
  // Phase 1 NEW models:
  "AgentAction",
  "AgentMemory",
  "PinnedView",
  "PerformanceSnapshot",
  "MetricEvent",
  // Darb 2.0 — delivery fulfillment (kept in sync with prismaExtensions.ts;
  // WebhookEvent stays excluded there AND here — rows are written before the
  // tenant is resolved).
  "Vendor",
  "VendorBranch",
  "DeliveryZone",
  "ZoneSurcharge",
  "FulfillmentSettings",
  "DeliveryOrder",
  "DispatchOffer",
  "WalletAccount",
  "WalletTransaction",
  "WalletEntry",
  "Remittance",
  "WalletReconciliationRun",
  "Incident",
  "FoodicsConnection",
]);

// Operations that read or bulk-modify rows; if these touch a tenant-scoped
// model they MUST filter by tenantId. `create`/`createMany` are exempt
// because they take `data`, not `where` (and the runtime guard verifies
// tenantId is present in `data`, separately).
const SCOPED_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/**
 * Mirror of `prismaExtensions.ts::hasTenantFilter`. Walks the `where`
 * ObjectExpression and returns true when:
 *   - top-level `tenantId` property exists, OR
 *   - `AND: [...]` array has at least one element naming `tenantId`, OR
 *   - `OR:  [...]` array has every element naming `tenantId`.
 */
function whereContainsTenantId(whereObject) {
  if (!whereObject || whereObject.type !== "ObjectExpression") return false;

  for (const prop of whereObject.properties) {
    if (!prop.key) continue;
    const keyName =
      prop.key.name ||
      (prop.key.type === "Literal" ? prop.key.value : undefined);

    if (keyName === "tenantId") return true;

    if (keyName === "AND" && prop.value && prop.value.type === "ArrayExpression") {
      const some = prop.value.elements.some(
        (el) => el && el.type === "ObjectExpression" && whereContainsTenantId(el),
      );
      if (some) return true;
    }

    if (keyName === "OR" && prop.value && prop.value.type === "ArrayExpression") {
      // OR scoping is only safe when EVERY branch carries tenantId.
      if (prop.value.elements.length === 0) continue;
      const every = prop.value.elements.every(
        (el) => el && el.type === "ObjectExpression" && whereContainsTenantId(el),
      );
      if (every) return true;
    }
  }
  return false;
}

/**
 * Capitalise first letter ("driver" -> "Driver") to compare the
 * delegate-property name (camelCase) against the model name (PascalCase).
 */
function delegateToModelName(delegateName) {
  if (!delegateName) return "";
  return delegateName.charAt(0).toUpperCase() + delegateName.slice(1);
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Tenant-scoped Prisma queries must include a tenantId filter in the where clause.",
      recommended: true,
    },
    messages: {
      missingTenantId:
        "prisma.{{model}}.{{op}} where clause must include tenantId. Tenant-scoped models require explicit tenantId filtering (REQ-tenant-scoped-everything). Add `tenantId: ctx.tenantId` (or equivalent) to where, or wrap the call in an AND/OR branch that does.",
      missingWhere:
        "prisma.{{model}}.{{op}} called without where filter (tenantId required). Tenant-scoped models require explicit tenantId filtering (REQ-tenant-scoped-everything).",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        // We're matching:    prisma.<delegate>.<op>(arg0, ...)
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression") return;

        const opNode = callee.property;
        const op =
          opNode && opNode.type === "Identifier" ? opNode.name : undefined;
        if (!op || !SCOPED_OPS.has(op)) return;

        const delegateMemberExpr = callee.object;
        if (
          !delegateMemberExpr ||
          delegateMemberExpr.type !== "MemberExpression"
        ) {
          return;
        }

        const prismaIdent = delegateMemberExpr.object;
        if (
          !prismaIdent ||
          prismaIdent.type !== "Identifier" ||
          prismaIdent.name !== "prisma"
        ) {
          return;
        }

        const delegateName =
          delegateMemberExpr.property &&
          delegateMemberExpr.property.type === "Identifier"
            ? delegateMemberExpr.property.name
            : undefined;
        if (!delegateName) return;

        const modelName = delegateToModelName(delegateName);
        if (!TENANT_SCOPED_MODELS.has(modelName)) return;

        const arg = node.arguments[0];

        // No args at all, e.g. `prisma.metricEvent.findMany()`.
        if (!arg) {
          context.report({
            node,
            messageId: "missingWhere",
            data: { model: delegateName, op },
          });
          return;
        }

        // First arg must be an ObjectExpression to inspect statically.
        // If it's a spread, identifier, or template, we can't reason — leave it.
        if (arg.type !== "ObjectExpression") return;

        const whereProp = arg.properties.find(
          (p) =>
            p.type === "Property" &&
            p.key &&
            (p.key.name === "where" ||
              (p.key.type === "Literal" && p.key.value === "where")),
        );

        if (!whereProp) {
          // For SCOPED_OPS, missing where is itself an error
          // (e.g. `prisma.metricEvent.findMany({})`).
          context.report({
            node,
            messageId: "missingWhere",
            data: { model: delegateName, op },
          });
          return;
        }

        if (!whereContainsTenantId(whereProp.value)) {
          context.report({
            node,
            messageId: "missingTenantId",
            data: { model: delegateName, op },
          });
        }
      },
    };
  },
};
