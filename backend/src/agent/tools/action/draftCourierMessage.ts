import { z } from "zod";
import { prisma } from "../../../config";
import { defineTool, toolRegistry } from "../../registry";

/**
 * Phase 2 — `draftCourierMessage`. The ONLY live write tool the monitor
 * agent ships in Phase 2.
 *
 * The monitor calls this with a draft message body; because
 * `requiresApproval: true` and the monitor's ToolContext never carries a
 * `userId`, the registry stages a `PendingAgentAction` row instead of
 * executing. The Decisions Surface renders the proposal, the operator
 * Confirms (optionally Edits the body within the `editableParams` allow-
 * list), and the Wave 2 approve route re-invokes the registry with the
 * approver's `userId` set — which falls through to the execute body
 * below, creating a Notification row and (Phase 9) enqueueing bilingual
 * delivery via the notification queue.
 *
 * English-only in Phase 2. Phase 9 will add Arabic translation, channel
 * selection (WhatsApp / SMS / IN_APP), and delivery-status webhooks.
 *
 * REQ-agent-action-drafting / REQ-agent-propose-confirm.
 */
export const draftCourierMessage = defineTool({
  name: "draftCourierMessage",
  description:
    "Draft a WhatsApp/SMS/IN_APP message to a single courier. The monitor calls this when a known anomaly class (late clock-ins, GPS stale, order rejections, cash mismatch, performance regression) suggests a coaching nudge or warning is appropriate. Tenant-scoped. requiresApproval=true — the registry stages a PendingAgentAction row that the operator reviews in the Decisions Surface, and the message is only sent after Confirm. English-only in Phase 2; Phase 9 adds bilingual delivery and channel routing. The bodyEnglish field is editable by the approver before send (editableParams).",
  inputSchema: {
    type: "object" as const,
    properties: {
      driverId: { type: "string", description: "Driver.id within the tenant scope." },
      intent: {
        type: "string",
        enum: [
          "WARN_LATE_CLOCKIN",
          "WARN_ORDER_REJECTIONS",
          "WARN_GPS_STALE",
          "CASH_REMINDER",
          "COACHING_PERFORMANCE",
          "PROMOTE_TOP_PERFORMER",
          "GENERIC",
        ],
        description: "Why this message is being drafted — used for analytics + future routing.",
      },
      bodyEnglish: {
        type: "string",
        description: "Drafted English message body (20-500 chars). Editable by the approver.",
      },
      channel: {
        type: "string",
        enum: ["WHATSAPP", "SMS", "IN_APP"],
        description: "Optional preferred delivery channel; the queue picks a default if absent.",
      },
    },
    required: ["driverId", "intent", "bodyEnglish"],
    additionalProperties: false,
  },
  inputValidator: z
    .object({
      driverId: z.string().min(1),
      intent: z.enum([
        "WARN_LATE_CLOCKIN",
        "WARN_ORDER_REJECTIONS",
        "WARN_GPS_STALE",
        "CASH_REMINDER",
        "COACHING_PERFORMANCE",
        "PROMOTE_TOP_PERFORMER",
        "GENERIC",
      ]),
      bodyEnglish: z.string().min(20).max(500),
      channel: z.enum(["WHATSAPP", "SMS", "IN_APP"]).optional(),
    })
    .strict(),
  strict: true,
  sideEffect: "notify",
  requiredRole: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"],
  requiresApproval: true,
  allowedAgents: ["monitor", "triage", "narrator", "chat"],
  editableParams: ["bodyEnglish"],
  async execute(ctx, input) {
    // Reached either after a human approves (ctx.userId set) or, when
    // AGENT_AUTO_APPROVE is on (default), directly from the monitor with no
    // approval step — the notification is then sent automatically.

    const driver = await prisma.driver.findFirst({
      where: { id: input.driverId, tenantId: ctx.tenantId },
      select: { id: true, name: true, phone: true },
    });
    if (!driver) {
      return { ok: false, error: "Driver not found in tenant scope" };
    }

    const channel = input.channel ?? "IN_APP";

    const notification = await prisma.notification.create({
      data: {
        tenantId: ctx.tenantId,
        type: `AGENT_DRAFT_${input.intent}`,
        category: "OPS_TODO",
        title: `Message to ${driver.name}`,
        message: input.bodyEnglish,
        severity: "MEDIUM",
        sourceId: driver.id,
        metadata: {
          channel,
          driverId: driver.id,
          driverPhone: driver.phone ?? null,
          intent: input.intent,
          drafterAgent: ctx.agentId,
          drafterRunId: ctx.runId,
          approverUserId: ctx.userId ?? null,
        },
      },
    });

    // TODO Phase 9: enqueue bilingual delivery via the notification queue
    // (WhatsApp / SMS / IN_APP fan-out + delivery-status webhooks).
    return { ok: true, notificationId: notification.id, channel };
  },
});

export function registerDraftCourierMessageTool() {
  toolRegistry.register(draftCourierMessage);
}

registerDraftCourierMessageTool();
