"use client";
import { useEffect, useMemo, useState, KeyboardEvent } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import Link from "next/link";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

interface UiForm {
  ordersPct: number;       // 0..100, integer (attendance is derived = 100 - ordersPct)
  penaltyPoints: number;   // 0..20, integer (wire = penaltyPoints / 100)
  goldPct: number;         // 0..100, integer
  silverPct: number;       // 0..100, integer (kept ≤ goldPct - 1)
  graceMin: number;        // integer
  bikeAreas: string[];
}

const DEFAULTS: UiForm = {
  ordersPct: 40,
  penaltyPoints: 5,
  goldPct: 95,
  silverPct: 80,
  graceMin: 15,
  bikeAreas: ["Salmiya", "Hawally", "Jabriya"],
};

export default function TargetsPage() {
  const { data: s } = useApiGet<any>("/api/americana/settings/tenant");
  const [form, setForm] = useState<UiForm>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [chipInput, setChipInput] = useState("");

  useEffect(() => {
    if (!s) return;
    const ordersWeight = s?.tierWeights?.orders ?? 0.4;
    const violationsWeight = s?.tierWeights?.violations ?? 0.05;
    const gold = s?.tierThresholds?.gold ?? 0.95;
    const silver = s?.tierThresholds?.silver ?? 0.8;
    setForm({
      ordersPct: clamp(Math.round(ordersWeight * 100), 0, 100),
      penaltyPoints: clamp(Math.round(violationsWeight * 100), 0, 20),
      goldPct: clamp(Math.round(gold * 100), 1, 100),
      silverPct: clamp(Math.round(silver * 100), 0, 99),
      graceMin: s?.lateArrivalGraceMin ?? 15,
      bikeAreas: Array.isArray(s?.bikeAreaWhitelist) ? s.bikeAreaWhitelist : DEFAULTS.bikeAreas,
    });
  }, [s]);

  const save = async () => {
    const payload = {
      americana: {
        tierWeights: {
          orders: form.ordersPct / 100,
          attendance: (100 - form.ordersPct) / 100,
          violations: form.penaltyPoints / 100,
        },
        tierThresholds: { gold: form.goldPct / 100, silver: form.silverPct / 100 },
        lateArrivalGraceMin: form.graceMin,
        bikeAreaWhitelist: form.bikeAreas,
      },
    };
    await api.put("/api/americana/settings/tenant", payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const setOrdersPct = (n: number) => setForm((f) => ({ ...f, ordersPct: clamp(Math.round(n), 0, 100) }));
  const setPenalty = (n: number) => setForm((f) => ({ ...f, penaltyPoints: clamp(Math.round(n), 0, 20) }));
  const setGrace = (n: number) => setForm((f) => ({ ...f, graceMin: clamp(Math.round(n), 0, 120) }));
  const setGold = (n: number) =>
    setForm((f) => {
      const gold = clamp(Math.round(n), 1, 100);
      const silver = Math.min(f.silverPct, gold - 1);
      return { ...f, goldPct: gold, silverPct: clamp(silver, 0, 99) };
    });
  const setSilver = (n: number) =>
    setForm((f) => {
      const silver = clamp(Math.round(n), 0, f.goldPct - 1);
      return { ...f, silverPct: silver };
    });

  const addChip = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setForm((f) => {
      const exists = f.bikeAreas.some((a) => a.toLowerCase() === v.toLowerCase());
      if (exists) return f;
      return { ...f, bikeAreas: [...f.bikeAreas, v] };
    });
    setChipInput("");
  };
  const removeChip = (idx: number) =>
    setForm((f) => ({ ...f, bikeAreas: f.bikeAreas.filter((_, i) => i !== idx) }));

  const onChipKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(chipInput);
    } else if (e.key === "Backspace" && chipInput === "" && form.bikeAreas.length > 0) {
      e.preventDefault();
      removeChip(form.bikeAreas.length - 1);
    }
  };

  const exampleTier = useMemo<"GOLD" | "SILVER" | "BRONZE">(() => {
    const composite =
      (form.ordersPct / 100) * 1 + ((100 - form.ordersPct) / 100) * 1 - (form.penaltyPoints / 100) * 0;
    if (composite >= form.goldPct / 100) return "GOLD";
    if (composite >= form.silverPct / 100) return "SILVER";
    return "BRONZE";
  }, [form]);

  return (
    <div className="space-y-6 w-full max-w-none">
      <div>
        <h1 className="text-xl font-semibold">How drivers are graded</h1>
        <p className="text-sm text-secondary mt-1">
          Set the rules that decide who earns Gold, Silver, and Bronze each month. Per-branch order targets live on the{" "}
          <Link href="/americana/settings/stores" className="text-primary underline">
            branches page
          </Link>
          .
        </p>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-7">
        <h2 className="text-base font-semibold">How drivers earn their monthly tier</h2>

        {/* What matters most? */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-medium">What matters most?</span>
            <span className="text-xs text-secondary">
              Orders <b className="text-gray-900">{form.ordersPct}%</b> · Attendance{" "}
              <b className="text-gray-900">{100 - form.ordersPct}%</b>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={form.ordersPct}
            onChange={(e) => setOrdersPct(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <div className="flex justify-between text-[11px] text-secondary mt-1">
            <span>All about orders</span>
            <span>Balanced</span>
            <span>All about attendance</span>
          </div>
          <p className="text-xs text-secondary mt-2">Move the slider toward what matters more for your team.</p>
        </div>

        {/* Penalty per violation */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-medium">Penalty per violation</span>
            <span className="text-xs text-secondary">
              Each violation costs <b className="text-gray-900">{form.penaltyPoints} points</b>
            </span>
          </div>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPenalty(form.penaltyPoints - 1)}
              className="w-9 h-9 rounded-lg border border-gray-200 text-lg leading-none hover:bg-gray-50"
              aria-label="Decrease"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={20}
              value={form.penaltyPoints}
              onChange={(e) => setPenalty(Number(e.target.value))}
              className="w-20 text-center px-2 py-1 border border-gray-200 rounded-md text-sm"
            />
            <button
              type="button"
              onClick={() => setPenalty(form.penaltyPoints + 1)}
              className="w-9 h-9 rounded-lg border border-gray-200 text-lg leading-none hover:bg-gray-50"
              aria-label="Increase"
            >
              +
            </button>
            <span className="text-xs text-secondary ml-1">points</span>
          </div>
          <p className="text-xs text-secondary mt-2">
            Each violation a driver gets this month subtracts this many points from their score.
          </p>
        </div>

        {/* Tier bands */}
        <div>
          <span className="text-sm font-medium">Tier cutoffs</span>
          <div className="mt-3 h-3 w-full rounded-full overflow-hidden flex bg-gray-100">
            <div className="bg-amber-700" style={{ width: `${form.silverPct}%` }} />
            <div className="bg-gray-300" style={{ width: `${form.goldPct - form.silverPct}%` }} />
            <div className="bg-amber-400" style={{ width: `${100 - form.goldPct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-secondary mt-1">
            <span>0%</span>
            <span>{form.silverPct}%</span>
            <span>{form.goldPct}%</span>
            <span>100%</span>
          </div>

          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              <span>
                <b>Gold</b> — top performers ({form.goldPct}% or higher, with zero violations).
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
              <span>
                <b>Silver</b> — solid ({form.silverPct}%–{form.goldPct - 1}%).
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-700 inline-block" />
              <span>
                <b>Bronze</b> — below {form.silverPct}%.
              </span>
            </li>
          </ul>

          <div className="grid grid-cols-2 gap-4 mt-4 max-w-md">
            <label className="text-sm">
              <span className="block text-xs text-secondary mb-1">Gold starts at</span>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.goldPct}
                  onChange={(e) => setGold(Number(e.target.value))}
                  className="w-full px-2 py-1.5 pr-7 border border-gray-200 rounded-md text-sm"
                />
                <span className="absolute right-2 top-1.5 text-xs text-secondary">%</span>
              </div>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-secondary mb-1">Silver starts at</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={form.silverPct}
                  onChange={(e) => setSilver(Number(e.target.value))}
                  className="w-full px-2 py-1.5 pr-7 border border-gray-200 rounded-md text-sm"
                />
                <span className="absolute right-2 top-1.5 text-xs text-secondary">%</span>
              </div>
            </label>
          </div>
        </div>

        {/* Live example */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="text-xs uppercase tracking-wide text-secondary mb-1">Example driver</div>
          <p className="text-sm leading-relaxed">
            A driver who completes <b>100%</b> of orders, attends <b>100%</b> of shifts, with <b>0</b> violations would
            be{" "}
            <span
              className={
                exampleTier === "GOLD"
                  ? "text-amber-600 font-semibold"
                  : exampleTier === "SILVER"
                  ? "text-gray-600 font-semibold"
                  : "text-amber-800 font-semibold"
              }
            >
              {exampleTier}
            </span>
            .
          </p>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <h2 className="text-base font-semibold">Operational rules</h2>

        {/* Late grace */}
        <div>
          <span className="text-sm font-medium">How late counts as a violation?</span>
          <div className="mt-2 inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGrace(form.graceMin - 1)}
              className="w-9 h-9 rounded-lg border border-gray-200 text-lg leading-none hover:bg-gray-50"
              aria-label="Decrease"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={120}
              value={form.graceMin}
              onChange={(e) => setGrace(Number(e.target.value))}
              className="w-20 text-center px-2 py-1 border border-gray-200 rounded-md text-sm"
            />
            <button
              type="button"
              onClick={() => setGrace(form.graceMin + 1)}
              className="w-9 h-9 rounded-lg border border-gray-200 text-lg leading-none hover:bg-gray-50"
              aria-label="Increase"
            >
              +
            </button>
            <span className="text-xs text-secondary ml-1">min</span>
          </div>
          <p className="text-xs text-secondary mt-2">
            Drivers get a {form.graceMin}-minute grace period after their shift starts before being marked late.
          </p>
        </div>

        {/* Bike areas */}
        <div>
          <span className="text-sm font-medium">Bike-only delivery areas</span>
          <div className="mt-2 flex flex-wrap items-center gap-2 p-2 border border-gray-200 rounded-lg min-h-[42px]">
            {form.bikeAreas.map((area, i) => (
              <span
                key={`${area}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs"
              >
                {area}
                <button
                  type="button"
                  onClick={() => removeChip(i)}
                  className="hover:text-emerald-900"
                  aria-label={`Remove ${area}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={chipInput}
              onChange={(e) => setChipInput(e.target.value)}
              onKeyDown={onChipKey}
              onBlur={() => addChip(chipInput)}
              placeholder={form.bikeAreas.length === 0 ? "Type an area and press Enter" : "Add another…"}
              className="flex-1 min-w-[140px] px-1 py-1 text-sm outline-none"
            />
          </div>
          <p className="text-xs text-secondary mt-2">
            Bike drivers can only be assigned to orders in these areas. Press Enter or comma to add.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover"
        >
          Save settings
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </div>
  );
}
