"use client";

export default function SettingsV2Page() {
  return (
    <div className="w-full max-w-none space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-secondary">Agent runtime, thresholds, and tenant config.</p>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Agent runtime</h2>
        <p className="mt-1 text-xs text-secondary">Three agents run in v2: Triage, Reconciliation, Narrator. Rename of legacy services: <code>aiScoringService</code> → <code>scoringService</code>, <code>aiAnomalyService</code> → <code>anomalyService</code> (no behavior change).</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <AgentCard id="triage" />
          <AgentCard id="reconciliation" />
          <AgentCard id="narrator" />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Thresholds</h2>
        <div className="mt-4 space-y-3 text-sm">
          <Row label="Triage auto-approve max KD" value="10.000" />
          <Row label="Cash fraud flag min KD (sum over 3 days)" value="15.000" />
          <Row label="GPS gap threshold (minutes)" value="15" />
        </div>
      </section>
    </div>
  );
}

function AgentCard({ id }: { id: string }) {
  const meta: Record<string, { desc: string; trigger: string; actor: string }> = {
    triage: { desc: "Ranks appeals, violations, cash gaps and stale alerts.", trigger: "event + cron 15m", actor: "OPS_MANAGER" },
    reconciliation: { desc: "Explains cash gaps; flags fraud patterns.", trigger: "event + nightly sweep", actor: "ACCOUNTANT" },
    narrator: { desc: "Hourly ops briefing from clustered signals.", trigger: "cron 1h (07:00–23:00 KW)", actor: "OPS_MANAGER" },
  };
  const m = meta[id] ?? { desc: "", trigger: "", actor: "" };
  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <div className="text-sm font-semibold capitalize">{id}</div>
      <p className="mt-1 text-xs text-secondary">{m.desc}</p>
      <div className="mt-3 space-y-1 text-[11px] text-secondary">
        <div><span className="font-medium">Triggers:</span> {m.trigger}</div>
        <div><span className="font-medium">Actor role:</span> {m.actor}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0">
      <span className="text-secondary">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
