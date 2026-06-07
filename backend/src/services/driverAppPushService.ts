import { prisma } from "../config";
import { logger } from "../config/logger";
import { Prisma } from "../generated/prisma";

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  channelId?: string;
};

type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type DispatchDriverPushArgs = {
  tenantId: string;
  issuedById: string;
  driverIds?: string[];
  candidateNames?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

async function sendExpoPush(messages: PushMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];

  const tickets: ExpoTicket[] = [];
  for (const part of chunk(messages, 100)) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(part),
    });

    const payload = (await response.json().catch(() => ({}))) as { data?: ExpoTicket[]; errors?: unknown };
    if (!response.ok) {
      logger.warn({ status: response.status, payload }, "expo push request failed");
      tickets.push(...part.map(() => ({ status: "error" as const, message: `Expo HTTP ${response.status}` })));
      continue;
    }
    tickets.push(...(payload.data ?? []));
  }

  return tickets;
}

export async function sendDispatchDriverPush(args: DispatchDriverPushArgs) {
  const candidateNames = [...new Set((args.candidateNames ?? []).map((name) => name.trim()).filter(Boolean))];
  const driverIds = [...new Set((args.driverIds ?? []).map((id) => id.trim()).filter(Boolean))];

  if (candidateNames.length === 0 && driverIds.length === 0) {
    throw new Error("At least one driver name or driver id is required");
  }

  const drivers = await prisma.driver.findMany({
    where: {
      tenantId: args.tenantId,
      status: "ACTIVE",
      OR: [
        ...(driverIds.length ? [{ id: { in: driverIds } }] : []),
        ...(candidateNames.length ? [{ name: { in: candidateNames } }] : []),
      ],
    },
    include: { device: true },
  });

  if (drivers.length === 0) {
    return { targeted: 0, commandQueued: 0, pushSent: 0, withoutPushToken: 0, tickets: [] };
  }

  const commandRows = drivers
    .filter((driver) => driver.device?.id)
    .map((driver) => ({
      deviceId: driver.device!.id,
      issuedById: args.issuedById,
      command: "SEND_MESSAGE" as const,
      payload: toJson({
        kind: "DISPATCH_PUSH",
        title: args.title,
        body: args.body,
        data: args.data ?? {},
        driverId: driver.id,
      }),
    }));

  if (commandRows.length) {
    await prisma.deviceCommand.createMany({ data: commandRows });
  }

  await prisma.notification.createMany({
    data: drivers.map((driver) => ({
      tenantId: args.tenantId,
      userId: null,
      title: args.title,
      message: args.body,
      type: "DRIVER_APP_PUSH",
      severity: "MEDIUM",
      sourceId: driver.id,
      category: "OPS_TODO",
      metadata: toJson({
        channel: "DRIVER_APP_PUSH",
        driverId: driver.id,
        driverName: driver.name,
        deviceId: driver.device?.id ?? null,
        expoPushTokenPresent: Boolean(driver.expoPushToken),
        ...(args.data ?? {}),
      }),
    })),
  });

  const pushTargets = drivers.filter((driver) => driver.expoPushToken);
  const messages = pushTargets.map((driver) => ({
    to: driver.expoPushToken!,
    title: args.title,
    body: args.body,
    sound: "default" as const,
    channelId: "darb-inbox",
    data: {
      type: "DISPATCH_PUSH",
      driverId: driver.id,
      ...(args.data ?? {}),
    },
  }));

  const tickets = await sendExpoPush(messages);
  await Promise.all(
    tickets.map((ticket, index) => {
      const driver = pushTargets[index];
      if (ticket?.details?.error !== "DeviceNotRegistered" || !driver) return Promise.resolve();
      return prisma.driver.update({
        where: { id: driver.id },
        data: { expoPushToken: null },
      });
    })
  );

  const pushSent = tickets.filter((ticket) => ticket?.status === "ok").length;
  const failed = tickets.filter((ticket) => ticket?.status === "error").length;
  if (failed > 0) {
    logger.warn({ failed, targeted: drivers.length }, "driver app push returned Expo errors");
  }

  await prisma.auditLog.create({
    data: {
      tenantId: args.tenantId,
      userId: args.issuedById,
      action: "DISPATCH_DRIVER_APP_PUSH",
      entityType: "Driver",
      entityId: drivers.map((driver) => driver.id).join(","),
      changes: toJson({
        title: args.title,
        body: args.body,
        targeted: drivers.map((driver) => ({ id: driver.id, name: driver.name })),
        commandQueued: commandRows.length,
        pushSent,
        failed,
        withoutPushToken: drivers.length - pushTargets.length,
        data: args.data ?? {},
      }),
    },
  });

  return {
    targeted: drivers.length,
    commandQueued: commandRows.length,
    pushSent,
    withoutPushToken: drivers.length - pushTargets.length,
    tickets,
  };
}
