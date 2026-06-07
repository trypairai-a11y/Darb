// Phase 4 Wave 4 — axios client for /api/pinned-views CRUD + /:id/refresh.
// Consumed by usePinnedViews / useUnpinView / useRefreshPin hooks.

import api from "@/lib/api";
import type { PinnedView, ViewType } from "@/types/chat";

const DEMO_PINNED_VIEWS: PinnedView[] = [
  {
    id: "demo-pin-revenue-drop",
    tenantId: "demo-tenant",
    userId: "demo-user",
    title: "Why revenue dipped yesterday",
    description: "Hawally revenue, coverage, and rejection-rate snapshot",
    viewType: "kpi_strip",
    spec: {
      type: "kpi_strip",
      tiles: [
        { label: "Revenue", value: "KD 4,820", delta: "-6.2%" },
        { label: "Coverage", value: "91%", delta: "-4 pts" },
        { label: "Reject rate", value: "7.8%", delta: "+2.1 pts" },
      ],
    },
    sortOrder: 0,
    pinnedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    lastViewedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    refreshFrequency: "on_open",
  } as PinnedView,
  {
    id: "demo-pin-cash-risk",
    tenantId: "demo-tenant",
    userId: "demo-user",
    title: "Cash risk shortlist",
    description: "Top overdue COD balances for accountant follow-up",
    viewType: "table",
    spec: {
      type: "table",
      columns: ["Driver", "Amount", "Age"],
      rows: [
        ["Hari Prasad", "KD 86.750", "4d"],
        ["Adil Rashid", "KD 64.250", "3d"],
        ["Nasir Javed", "KD 48.900", "2d"],
      ],
    },
    sortOrder: 1,
    pinnedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    lastViewedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    refreshFrequency: "on_open",
  } as PinnedView,
];

function shouldUseDemoFallback(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return isLocalhost && (status === 404 || status === 500 || status === undefined);
}

export type RefreshFrequency = "on_open" | "live" | "static";

export interface CreatePinBody {
  viewType: ViewType | string;
  spec: object;
  title: string;
  description?: string;
  sortOrder?: number;
  refreshFrequency?: RefreshFrequency;
  sourceThreadId?: string;
  sourceMessageId?: string;
}

export const pinnedViewsApi = {
  async list(): Promise<{ pinnedViews: PinnedView[] }> {
    try {
      const { data } = await api.get("/api/pinned-views");
      if (!data.pinnedViews?.length && typeof window !== "undefined") {
        return { pinnedViews: DEMO_PINNED_VIEWS };
      }
      return data;
    } catch (error) {
      if (shouldUseDemoFallback(error)) return { pinnedViews: DEMO_PINNED_VIEWS };
      throw error;
    }
  },
  async create(
    body: CreatePinBody,
  ): Promise<{
    pinnedView: PinnedView;
    warnSoftCap?: boolean;
    deduplicated?: boolean;
  }> {
    const { data } = await api.post("/api/pinned-views", body);
    return data;
  },
  async patch(
    id: string,
    body: Partial<{
      title: string;
      description: string;
      sortOrder: number;
      refreshFrequency: RefreshFrequency;
    }>,
  ): Promise<{ pinnedView: PinnedView }> {
    const { data } = await api.patch(`/api/pinned-views/${id}`, body);
    return data;
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/api/pinned-views/${id}`);
    return data;
  },
  async refresh(
    id: string,
  ): Promise<{ pinnedView: PinnedView; refreshedSpec: unknown; note?: string }> {
    const { data } = await api.post(`/api/pinned-views/${id}/refresh`);
    return data;
  },
};
