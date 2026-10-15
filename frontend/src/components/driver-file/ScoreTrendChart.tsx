"use client";

// Phase 3 Wave 3 — 90-day score trend chart for the Driver File.
// Recharts LineChart with explicit empty-state copy per RESEARCH §Pitfall 1.

import { useI18n } from "@/i18n/I18nProvider";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export interface ScoreTrendPoint {
  snapshotDate: string;
  compositeScore: number;
}

export interface ScoreTrendChartProps {
  points: ScoreTrendPoint[];
}

export default function ScoreTrendChart({ points }: ScoreTrendChartProps) {
  const { t } = useI18n();
  if (!points || points.length === 0) {
    return (
      <div className="text-sm text-sand-700 py-6 text-center">
        {t("driverFile.noTrend")}
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 260 }} dir="ltr">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="snapshotDate" stroke="#9ca3af" fontSize={11} />
          <YAxis stroke="#9ca3af" fontSize={11} domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="compositeScore" stroke="#1D4E89" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
