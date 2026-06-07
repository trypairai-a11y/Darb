import { prisma } from "../config";
import { sendWhatsApp, sendSms, sendEmail } from "./notificationChannels";
import { enqueueNotification } from "../queues/notificationQueue";
import { logger } from "../config/logger";
import { NotificationChannel } from "../generated/prisma";

type OutboundChannel = "WHATSAPP" | "EMAIL" | "SMS";

/**
 * Persist a NotificationDelivery row then enqueue it. Falls back to
 * synchronous dispatch when Redis is unavailable so dev environments
 * still get feedback. Idempotency key is (tenantId, channel, recipient,
 * eventType, date) so retries + duplicate rule fanout collapse.
 */
async function deliverExternal(params: {
  tenantId: string;
  channel: OutboundChannel;
  recipient: string;
  subject?: string;
  body: string;
  sourceType: string;
  sourceId?: string;
}) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const idempotencyKey = `${params.tenantId}:${params.channel}:${params.recipient}:${params.sourceType}:${day.toISOString().split("T")[0]}`;

  // Upsert the delivery row so retries/duplicates collapse
  const existing = await prisma.notificationDelivery.findUnique({
    where: { idempotencyKey },
  });
  if (existing && (existing.status === "SENT" || existing.status === "SENDING" || existing.status === "QUEUED")) {
    return existing;
  }

  const row = existing
    ? await prisma.notificationDelivery.update({
        where: { id: existing.id },
        data: { status: "QUEUED", body: params.body, subject: params.subject, error: null },
      })
    : await prisma.notificationDelivery.create({
        data: {
          tenantId: params.tenantId,
          channel: params.channel as NotificationChannel,
          recipient: params.recipient,
          subject: params.subject,
          body: params.body,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          idempotencyKey,
          status: "QUEUED",
        },
      });

  const result = await enqueueNotification(
    {
      deliveryId: row.id,
      channel: params.channel,
      recipient: params.recipient,
      subject: params.subject,
      body: params.body,
      tenantId: params.tenantId,
    },
    idempotencyKey
  );

  if (result === "fallback") {
    // No Redis — synchronous dispatch so nothing silently queues forever
    const dispatch =
      params.channel === "WHATSAPP"
        ? sendWhatsApp(params.recipient, params.body)
        : params.channel === "SMS"
          ? sendSms(params.recipient, params.body)
          : sendEmail(params.recipient, params.subject || "Darb notification", params.body);

    dispatch
      .then(async (r) => {
        await prisma.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: r.ok ? "SENT" : "FAILED",
            provider: r.provider,
            error: r.error || null,
            sentAt: r.ok ? new Date() : null,
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });
        if (!r.ok) logger.warn({ channel: params.channel, provider: r.provider, err: r.error }, "notification fallback send failed");
      })
      .catch((e) => logger.error({ err: e }, "notification fallback threw"));
  }

  return row;
}

/**
 * Create notifications for all users matching the notification rules
 * for a given violation type within a tenant.
 * Supports in-app, WhatsApp, email, and SMS channels.
 */
export async function createViolationNotifications(params: {
  tenantId: string;
  eventType: string;
  severity: string;
  title: string;
  message: string;
  sourceId?: string;
  metadata?: any;
}) {
  const { tenantId, eventType, severity, title, message, sourceId, metadata } = params;

  // Find notification rules for this event type
  const rules = await prisma.notificationRule.findMany({
    where: { tenantId, eventType, enabled: true },
  });

  if (rules.length === 0) return { created: 0 };

  // Load platform settings to determine enabled channels
  const platformSettings = await prisma.platformSettings.findFirst({ where: { tenantId } });
  const notifConfig = (platformSettings?.notificationConfig as any) || {};
  const channels = notifConfig.channels || { inApp: true, whatsapp: false, sms: false, email: false };

  const targetRoles = rules.map((r) => r.role);

  const users = await prisma.user.findMany({
    where: { tenantId, role: { in: targetRoles }, isActive: true },
    select: { id: true, email: true, phone: true },
  });

  if (users.length === 0) return { created: 0 };

  // In-app notifications (always created if inApp is enabled)
  let inAppCount = 0;
  if (channels.inApp !== false) {
    const notifications = await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId,
        userId: user.id,
        title,
        message,
        type: eventType,
        severity,
        sourceId,
        metadata,
      })),
    });
    inAppCount = notifications.count;
  }

  // External channels — persisted to NotificationDelivery and enqueued for
  // the BullMQ worker. Failures are visible in the NotificationDelivery
  // table instead of lost to in-process fire-and-forget.
  for (const user of users) {
    if (channels.whatsapp && user.phone) {
      deliverExternal({
        tenantId,
        channel: "WHATSAPP",
        recipient: user.phone,
        body: `[${title}] ${message}`,
        sourceType: eventType,
        sourceId,
      }).catch((e) => logger.error({ err: e, userId: user.id }, "enqueue whatsapp failed"));
    }
    if (channels.email && user.email) {
      deliverExternal({
        tenantId,
        channel: "EMAIL",
        recipient: user.email,
        subject: title,
        body: message,
        sourceType: eventType,
        sourceId,
      }).catch((e) => logger.error({ err: e, userId: user.id }, "enqueue email failed"));
    }
    if (channels.sms && user.phone) {
      deliverExternal({
        tenantId,
        channel: "SMS",
        recipient: user.phone,
        body: `${title}: ${message}`,
        sourceType: eventType,
        sourceId,
      }).catch((e) => logger.error({ err: e, userId: user.id }, "enqueue sms failed"));
    }
  }

  return { created: inAppCount };
}

const TICKET_CATEGORY_LABELS: Record<string, string> = {
  VEHICLE_REPAIR: "Vehicle repair",
  EQUIPMENT_REQUEST: "Equipment request",
  LEAVE_REQUEST: "Leave request",
  SALARY_ISSUE: "Salary issue",
  TRANSFER_REQUEST: "Transfer request",
  COMPLAINT: "Complaint",
  ACCIDENT_REPORT: "Accident report",
  OTHER: "Other",
};

/**
 * Notify supervisors/ops_managers/admins that a driver filed a ticket.
 * Reuses the generic notification rule + role fan-out used for violations.
 */
export async function createTicketSubmittedNotification(params: {
  tenantId: string;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
    category: string;
  };
  driverName?: string | null;
}) {
  const { tenantId, ticket, driverName } = params;
  const categoryLabel = TICKET_CATEGORY_LABELS[ticket.category] ?? ticket.category;
  const severity = ticket.category === "ACCIDENT_REPORT" ? "HIGH" : "MEDIUM";

  return createViolationNotifications({
    tenantId,
    eventType: "TICKET_SUBMITTED",
    severity,
    title: "New driver ticket",
    message: `${driverName ?? "A driver"} filed ${categoryLabel} · ${ticket.ticketNumber}: ${ticket.title}`,
    sourceId: ticket.id,
    metadata: { ticketId: ticket.id, category: ticket.category },
  });
}

/** Severity mapping for violation event types */
export function getViolationSeverity(type: string): string {
  const severityMap: Record<string, string> = {
    // Talabat compliance events
    CASH_THRESHOLD_EXCEEDED: "CRITICAL",
    SELFIE_FAIL: "HIGH",
    GPS_OFF: "HIGH",
    OUT_OF_ZONE: "HIGH",
    ZONE_MISMATCH: "HIGH",
    SHIFT_NOT_BOOKED: "HIGH",
    LATE_CLOCK_IN: "MEDIUM",
    EARLY_CLOCK_OUT: "MEDIUM",
    ORDER_CLICK_THROUGH: "MEDIUM",
    EQUIPMENT_MISSING: "MEDIUM",
    // Cross-platform violation types
    DROP_OFF_IN_ADVANCE: "CRITICAL",
    ORDER_VERY_LATE: "CRITICAL",
    LATE_PICKUP: "HIGH",
    GPS_NOT_UPLOADING: "HIGH",
    INVALID_DELIVERY_PHOTO: "HIGH",
    ORDER_SLIGHTLY_LATE: "MEDIUM",
    ORDER_REJECTION_TIMEOUT: "MEDIUM",
  };
  return severityMap[type] || "MEDIUM";
}
