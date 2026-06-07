import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../config";
import { env } from "../config/env";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DigestSection {
  summary: string;
  alerts: string[];
  recommendations: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AiDigestService {
  /**
   * Gather yesterday's operational data for a tenant, send to Claude, and
   * persist the structured digest in the AiDigest table.
   */
  static async generateDailyDigest(tenantId: string): Promise<DigestSection | null> {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn("[AiDigestService] ANTHROPIC_API_KEY is not set - skipping digest");
      return null;
    }

    // ── Date range: yesterday (UTC) ────────────────────────────────────────
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setUTCDate(now.getUTCDate() - 1);
    yesterdayStart.setUTCHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setUTCHours(23, 59, 59, 999);

    // ── Query all relevant data in parallel ────────────────────────────────
    const [shifts, orders, attendance, cash, alerts, tickets] = await Promise.all([
      prisma.shift.findMany({
        where: {
          tenantId,
          date: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        include: { driver: { select: { name: true, platform: true } } },
      }),

      prisma.orderLog.findMany({
        where: {
          tenantId,
          date: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        include: { driver: { select: { name: true } } },
      }),

      prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          date: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        include: { driver: { select: { name: true } } },
      }),

      prisma.cashRecord.findMany({
        where: {
          tenantId,
          date: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        include: { driver: { select: { name: true } } },
      }),

      prisma.alert.findMany({
        where: {
          tenantId,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),

      prisma.ticket.findMany({
        where: {
          tenantId,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
    ]);

    // ── Build a compact summary payload ───────────────────────────────────
    const shiftStats = {
      total: shifts.length,
      completed: shifts.filter((s) => s.status === "COMPLETED").length,
      missed: shifts.filter((s) => s.status === "MISSED").length,
      cancelled: shifts.filter((s) => s.status === "CANCELLED").length,
    };

    const orderStats = {
      totalLogs: orders.length,
      totalOrders: orders.reduce((sum, o) => sum + o.orderCount, 0),
      totalCashCollected: orders
        .reduce((sum, o) => sum + Number(o.cashCollected ?? 0), 0)
        .toFixed(3),
    };

    const attendanceStats = {
      present: attendance.filter((a) => a.status === "PRESENT").length,
      late: attendance.filter((a) => a.status === "LATE").length,
      absent: attendance.filter((a) => a.status === "ABSENT").length,
      earlyLeave: attendance.filter((a) => a.status === "EARLY_LEAVE").length,
    };

    const cashStats = {
      totalRecords: cash.length,
      settled: cash.filter((c) => c.status === "SETTLED").length,
      pending: cash.filter((c) => c.status === "PENDING").length,
      totalSales: cash
        .reduce((sum, c) => sum + Number(c.salesAmount), 0)
        .toFixed(3),
      totalPendingDues: cash
        .reduce((sum, c) => sum + Number(c.pendingDues), 0)
        .toFixed(3),
    };

    const alertStats = {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "CRITICAL").length,
      high: alerts.filter((a) => a.severity === "HIGH").length,
      unresolved: alerts.filter((a) => a.status === "ACTIVE").length,
    };

    const ticketStats = {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "OPEN").length,
      assigned: tickets.filter((t) => t.status === "ASSIGNED").length,
      inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
      resolved: tickets.filter((t) => t.status === "RESOLVED").length,
      byCategory: {
        vehicleRepair: tickets.filter((t) => t.category === "VEHICLE_REPAIR").length,
        equipmentRequest: tickets.filter((t) => t.category === "EQUIPMENT_REQUEST").length,
        leaveRequest: tickets.filter((t) => t.category === "LEAVE_REQUEST").length,
        complaint: tickets.filter((t) => t.category === "COMPLAINT").length,
        other: tickets.filter((t) => t.category === "OTHER").length,
      },
      overdue: tickets.filter(
        (t) => t.slaDeadline && new Date(t.slaDeadline) < now && t.status !== "RESOLVED" && t.status !== "CLOSED"
      ).length,
    };

    const summaryPayload = {
      date: yesterdayStart.toISOString().split("T")[0],
      shifts: shiftStats,
      orders: orderStats,
      attendance: attendanceStats,
      cash: cashStats,
      alerts: alertStats,
      tickets: ticketStats,
    };

    // ── Send to Claude ─────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are an operations assistant for a fleet management company in Kuwait managing delivery drivers across platforms (KEETA, TALABAT, DELIVEROO, AMERICANA).

Analyze the operational summary provided and respond ONLY with valid JSON in this exact structure:
{
  "summary": "2-3 sentence executive summary of the day",
  "alerts": ["list of actionable alert strings, max 5"],
  "recommendations": ["list of specific improvement recommendations, max 5"]
}

Include ticket-related alerts when there are open, overdue, or high-volume tickets. Highlight overdue tickets and unresolved complaints.
Be concise, data-driven, and actionable. Currency is KD (Kuwaiti Dinar).`;

    const userMessage = `Here is yesterday's operational data for ${yesterdayStart.toISOString().split("T")[0]}:\n\n${JSON.stringify(summaryPayload, null, 2)}\n\nGenerate the daily digest JSON.`;

    let digestContent: DigestSection;

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "{}";

      const cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();

      digestContent = JSON.parse(cleaned) as DigestSection;
    } catch (err) {
      console.error("[AiDigestService] Claude API error:", err);
      // Fallback digest so we always persist something
      digestContent = {
        summary: `Operational digest for ${yesterdayStart.toISOString().split("T")[0]}. ${shiftStats.completed} shifts completed, ${orderStats.totalOrders} total orders.`,
        alerts: alertStats.critical > 0 ? [`${alertStats.critical} critical alerts require attention`] : [],
        recommendations: ["Review missed shifts and follow up with drivers"],
      };
    }

    // ── Persist to AiDigest ────────────────────────────────────────────────
    const digestDate = new Date(yesterdayStart);
    digestDate.setUTCHours(0, 0, 0, 0);

    await prisma.aiDigest.upsert({
      where: {
        tenantId_date: {
          tenantId,
          date: digestDate,
        },
      },
      update: {
        content: digestContent as object,
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        date: digestDate,
        content: digestContent as object,
        generatedAt: new Date(),
      },
    });

    return digestContent;
  }

  /**
   * Retrieve the most recent AI digest for a tenant.
   */
  static async getLatestDigest(tenantId: string) {
    return prisma.aiDigest.findFirst({
      where: { tenantId },
      orderBy: { date: "desc" },
    });
  }
}
