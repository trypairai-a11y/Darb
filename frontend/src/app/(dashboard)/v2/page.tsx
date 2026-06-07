"use client";
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import api from "@/lib/api";
import PulseStrip from "@/components/command-centre/PulseStrip";
import MorningBriefing from "@/components/command-centre/MorningBriefing";
import AttentionFeed, { AttentionItem } from "@/components/command-centre/AttentionFeed";
import { MOCK_PULSE, MOCK_BRIEFING, MOCK_ATTENTION } from "@/mocks/v2";

/**
 * Command Centre — the single landing page for ops managers in v2.
 * Replaces /overview, /insights, keeta/monitor, keeta/shift-monitor,
 * keeta/operation-centre, and the standalone alerts UI.
 */

export default function CommandCentrePage() {
  const [pulse, setPulse] = useState<any>(null);
  const [briefing, setBriefing] = useState<any>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [pulseRes, briefingRes, queueRes] = await Promise.allSettled([
      api.get("/api/v2/pulse"),
      api.get("/api/v2/briefing"),
      api.get("/api/queue", { params: { resolved: "false", limit: 10 } }),
    ]);

    // Fall back to mock data if live endpoints unavailable — lets the preview
    // render with or without a configured agent runtime.
    setPulse(pulseRes.status === "fulfilled" ? pulseRes.value.data : MOCK_PULSE);
    setBriefing(briefingRes.status === "fulfilled" && briefingRes.value.data ? briefingRes.value.data : MOCK_BRIEFING);
    setAttention(
      queueRes.status === "fulfilled" && Array.isArray(queueRes.value.data?.data) && queueRes.value.data.data.length > 0
        ? queueRes.value.data.data
        : MOCK_ATTENTION
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onDecision(item: AttentionItem, decision: "approve" | "reject") {
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    try {
      await api.post(`/api/queue/${item.id}/decision`, { decision });
      setAttention((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      // On mock data, optimistically remove
      setAttention((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <div className="w-full max-w-none space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-white">
          <Sparkles size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Command Centre</h1>
          <p className="text-sm text-secondary">Everything that needs your attention, ranked. Press ⌘K to ask or act.</p>
        </div>
      </div>

      <MorningBriefing briefing={briefing} loading={loading} />

      <AttentionFeed
        items={attention}
        loading={loading}
        busyIds={busyIds}
        onApprove={(item) => onDecision(item, "approve")}
        onReject={(item) => onDecision(item, "reject")}
      />

      <PulseStrip pulse={pulse} loading={loading} />
    </div>
  );
}
