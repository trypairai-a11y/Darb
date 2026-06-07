"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import ShortlistView, { ShortlistItem } from "@/components/shared/ShortlistView";
import { MOCK_ATTENTION } from "@/mocks/v2";

const PLATFORMS = ["ALL", "KEETA", "TALABAT", "DELIVEROO", "AMERICANA"] as const;
type PlatformFilter = (typeof PLATFORMS)[number];

export default function TriagePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<PlatformFilter>("ALL");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/queue", { params: { resolved: "false", limit: 25 } });
      setItems(Array.isArray(data?.data) && data.data.length > 0 ? data.data : MOCK_ATTENTION);
    } catch {
      setItems(MOCK_ATTENTION);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await api.post(`/api/queue/${id}/decision`, { decision });
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch {
      setItems((prev) => prev.filter((it) => it.id !== id));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const shortlistItems: ShortlistItem[] = items.map((it: any) => ({
    id: it.id,
    badge: {
      label: it.recommendation?.toUpperCase() ?? "PENDING",
      tone: it.recommendation === "approve" ? "success" : it.recommendation === "reject" ? "critical" : "info",
    },
    title: `${agentName(it.agentId)} · ${formatTool(it.toolName)}`,
    description: it.reasoning,
    meta: ([
      { label: `conf ${Math.round((it.confidence ?? 0) * 100)}%`, tone: "default" as const },
      { label: `priority ${(it.priorityScore ?? 0).toFixed(2)}`, tone: ((it.priorityScore ?? 0) > 0.7 ? "critical" : (it.priorityScore ?? 0) > 0.4 ? "warning" : "default") as "critical" | "warning" | "default" },
      { label: it.subjectType ? `${it.subjectType}:${String(it.subjectId ?? "").slice(0, 8)}` : "", tone: "default" as const },
    ] as const).filter((m) => m.label) as any,
    primaryAction: {
      label: busyIds.has(it.id) ? "…" : "Approve",
      onClick: () => decide(it.id, "approve"),
    },
    secondaryAction: { label: "Reject", onClick: () => decide(it.id, "reject") },
  }));

  return (
    <div className="w-full max-w-none">
      <ShortlistView
        title="Triage"
        subtitle="Decisions agents have staged for you, ranked by priority. Approve or reject in one click."
        items={shortlistItems}
        loading={loading}
        emptyHint="Agents will queue items here as they reason about violations, appeals, and cash gaps."
        filters={
          <div className="flex items-center gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (platform === p ? "bg-foreground text-white" : "bg-white text-secondary ring-1 ring-gray-200 hover:bg-gray-50")
                }
              >
                {p === "ALL" ? "All platforms" : p}
              </button>
            ))}
          </div>
        }
        browseContent={
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-secondary shadow-sm">
            Browse view — the full raw decision log will render here (historical approvals, rejections, agent runs).
          </div>
        }
      />
    </div>
  );
}

function agentName(id?: string) {
  if (id === "triage") return "Triage";
  if (id === "reconciliation") return "Recon";
  if (id === "narrator") return "Narrator";
  return id ?? "Agent";
}

function formatTool(name?: string) {
  if (!name) return "decision";
  return name.replace(/^propose/, "").replace(/([A-Z])/g, " $1").trim();
}
