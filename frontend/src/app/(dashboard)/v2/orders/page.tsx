"use client";
import { useEffect, useState } from "react";
import ShortlistView, { ShortlistItem } from "@/components/shared/ShortlistView";
import { MOCK_ORDERS } from "@/mocks/v2";

const PLATFORMS = ["ALL", "KEETA", "TALABAT", "DELIVEROO", "AMERICANA"] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<typeof MOCK_ORDERS>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("ALL");

  useEffect(() => {
    setTimeout(() => {
      setOrders(MOCK_ORDERS);
      setLoading(false);
    }, 300);
  }, []);

  const filtered = platform === "ALL" ? orders : orders.filter((o) => o.platform === platform);
  const attention = filtered.filter((o) => o.status === "LATE");

  const shortlistItems: ShortlistItem[] = attention.map((o) => ({
    id: o.id,
    badge: { label: o.eta.startsWith("+") ? `LATE ${o.eta}` : "LATE", tone: "critical" },
    title: `${o.merchant} → ${o.customer}`,
    description: `Courier ${o.driver} · ${o.platform} · ${o.kd} KD`,
    meta: [{ label: o.at, tone: "warning" }, { label: o.platform }],
  }));

  return (
    <div className="w-full max-w-none">
      <ShortlistView
        title="Orders"
        subtitle="Orders that broke their ETA or need a look. Full order stream under Browse."
        items={shortlistItems}
        loading={loading}
        emptyHint="No late orders in the last hour."
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
                {p === "ALL" ? "All" : p}
              </button>
            ))}
          </div>
        }
        browseContent={
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">At</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Merchant → Customer</th>
                  <th className="px-4 py-3 font-medium">KD</th>
                  <th className="px-4 py-3 font-medium">ETA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-secondary">{o.at}</td>
                    <td className="px-4 py-3">{o.platform}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          o.status === "LATE"
                            ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            : o.status === "DELIVERED"
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                        }
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{o.driver}</td>
                    <td className="px-4 py-3 text-secondary">{o.merchant} → {o.customer}</td>
                    <td className="px-4 py-3">{o.kd}</td>
                    <td className="px-4 py-3">{o.eta}</td>
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
