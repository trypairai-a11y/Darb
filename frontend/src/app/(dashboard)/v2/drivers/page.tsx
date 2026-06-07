"use client";
import { useEffect, useState } from "react";
import ShortlistView, { ShortlistItem } from "@/components/shared/ShortlistView";
import { MOCK_DRIVERS } from "@/mocks/v2";

const PLATFORMS = ["ALL", "KEETA", "TALABAT", "DELIVEROO", "AMERICANA"] as const;

export default function DriversPage() {
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("ALL");
  const [drivers, setDrivers] = useState<typeof MOCK_DRIVERS>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setDrivers(MOCK_DRIVERS);
      setLoading(false);
    }, 400);
  }, []);

  const filtered = platform === "ALL" ? drivers : drivers.filter((d) => d.platform === platform);

  // Shortlist = drivers the Triage Agent has flagged (flag field) + off-shift repeat offenders
  const flagged = filtered.filter((d) => d.flag);
  const shortlistItems: ShortlistItem[] = flagged.map((d) => ({
    id: d.id,
    badge: { label: d.flag === "cash-gap" ? "CASH GAP" : "REPEAT LATE", tone: d.flag === "cash-gap" ? "critical" : "warning" },
    title: d.name,
    description: d.flag === "cash-gap"
      ? "4 consecutive days of unexplained cash gaps. Recon Agent has evidence ready for review."
      : "3 late deliveries this week, all in the same zone and time window.",
    meta: [
      { label: d.platform },
      { label: d.zone },
      { label: `score ${d.score}` },
      { label: `trend ${d.trend}`, tone: d.trend === "DOWN" ? "critical" : d.trend === "UP" ? "success" : "default" },
    ],
    primaryAction: { label: "Open", onClick: () => {} },
  }));

  return (
    <div className="w-full max-w-none">
      <ShortlistView
        title="Drivers"
        subtitle="Drivers the agents are watching. Full roster available under Browse."
        items={shortlistItems}
        loading={loading}
        emptyHint="All drivers are operating nominally — no agent flags in the last 24h."
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
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Zone</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Trend</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">On shift</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-secondary">{d.platform}</td>
                    <td className="px-4 py-3 text-secondary">{d.zone}</td>
                    <td className="px-4 py-3">{d.score}</td>
                    <td className="px-4 py-3">
                      <span className={d.trend === "DOWN" ? "text-red-600" : d.trend === "UP" ? "text-emerald-600" : "text-gray-500"}>{d.trend}</span>
                    </td>
                    <td className="px-4 py-3">{d.status}</td>
                    <td className="px-4 py-3">{d.onShift ? "●" : "○"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      />
    </div>
  );
}
