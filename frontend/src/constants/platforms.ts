export type PlatformKey = "TALABAT" | "KEETA" | "DELIVEROO" | "AMERICANA";

export interface PlatformConfig {
  key: PlatformKey;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  routes: {
    overview: string;
    drivers: string;
    shifts: string;
    attendance: string;
    settings: string;
  };
}

export const PLATFORMS: Record<PlatformKey, PlatformConfig> = {
  TALABAT: {
    key: "TALABAT",
    label: "Talabat",
    color: "#FF5A00",
    bgColor: "bg-orange-500",
    textColor: "text-orange-500",
    routes: {
      overview: "/talabat/overview",
      drivers: "/talabat/drivers",
      shifts: "/talabat/shifts",
      attendance: "/talabat/attendance",
      settings: "/talabat/settings",
    },
  },
  KEETA: {
    key: "KEETA",
    label: "Keeta",
    color: "#FFB800",
    bgColor: "bg-yellow-500",
    textColor: "text-yellow-500",
    routes: {
      overview: "/keeta/overview",
      drivers: "/keeta/drivers",
      shifts: "/keeta/shifts",
      attendance: "/keeta/attendance",
      settings: "/keeta/settings",
    },
  },
  DELIVEROO: {
    key: "DELIVEROO",
    label: "Deliveroo Equipment",
    color: "#00CCBC",
    bgColor: "bg-teal-500",
    textColor: "text-teal-500",
    routes: {
      overview: "/deliveroo/overview",
      drivers: "/deliveroo/drivers",
      shifts: "/deliveroo/shifts",
      attendance: "/deliveroo/attendance",
      settings: "/deliveroo/settings",
    },
  },
  AMERICANA: {
    key: "AMERICANA",
    label: "Americana",
    color: "#E63946",
    bgColor: "bg-red-500",
    textColor: "text-red-500",
    routes: {
      overview: "/americana/overview",
      drivers: "/americana/drivers",
      shifts: "/americana/shifts",
      attendance: "/americana/attendance",
      settings: "/americana/settings",
    },
  },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);

/** Get platform config by key, with safe fallback */
export function getPlatform(key: string): PlatformConfig | undefined {
  return PLATFORMS[key?.toUpperCase() as PlatformKey];
}

/** Get platform color hex by key */
export function getPlatformColor(key: string): string {
  return getPlatform(key)?.color ?? "#6b7280";
}

/** Get platform label by key */
export function getPlatformLabel(key: string): string {
  return getPlatform(key)?.label ?? key;
}
