"use client";
// Revision 13 (#6) — which tabs one delivery-company login can open.
//
// The mirror of components/vendor/TabPicker, and its own component because the
// two portals have different tabs and different i18n keys, not because the
// interaction differs. Two modes on purpose: "whatever the role opens" is the
// default and is what every existing fleet login does, so nothing changes for
// anyone until an owner deliberately narrows somebody. "Choose the tabs"
// replaces that with an explicit list. The server keeps the same distinction: a
// null column means inherit, an array means this exactly.
import { FLEET_TAB_ORDER, fleetRoleDefaultTabs } from "@/lib/fleetTabs";
import type { FleetPortalRole, FleetTab } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

interface FleetTabPickerProps {
  /** The role, which decides what "inherit" resolves to in the preview. */
  fleetRole: FleetPortalRole;
  /** null = inherit the role's tabs. An array = this exact list. */
  value: FleetTab[] | null;
  onChange: (next: FleetTab[] | null) => void;
}

export default function FleetTabPicker({ fleetRole, value, onChange }: FleetTabPickerProps) {
  const { t } = useI18n();
  const custom = value !== null;
  const effective = value ?? fleetRoleDefaultTabs(fleetRole);

  const toggle = (tab: FleetTab) => {
    const next = effective.includes(tab)
      ? effective.filter((x) => x !== tab)
      : FLEET_TAB_ORDER.filter((x) => x === tab || effective.includes(x));
    onChange(next);
  };

  return (
    <div>
      <span className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
        {t("fleetTeam.tabs")}
      </span>

      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit mb-3">
        {[
          { key: "inherit", label: t("fleetTeam.tabsInherit"), on: !custom },
          { key: "custom", label: t("fleetTeam.tabsCustom"), on: custom },
        ].map((mode) => (
          <button
            key={mode.key}
            type="button"
            // Switching to custom starts from what the role already opens, so an
            // owner narrows a working set rather than building one from nothing.
            onClick={() => onChange(mode.key === "custom" ? fleetRoleDefaultTabs(fleetRole) : null)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              mode.on ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FLEET_TAB_ORDER.map((tab) => {
          const on = effective.includes(tab);
          return (
            <button
              key={tab}
              type="button"
              disabled={!custom}
              onClick={() => toggle(tab)}
              aria-pressed={on}
              className={cn(
                "px-3.5 h-9 rounded-pill text-xs font-medium border transition-colors",
                on
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-sand-600 border-sand-300 hover:bg-sand-100",
                // Greyed while inheriting: the chips are showing what the role
                // gives, and clicking one there would silently switch modes.
                !custom && "opacity-60 cursor-default",
              )}
            >
              {t(`fleetTeam.tab${tab}`)}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-sand-600">
        {custom && effective.length === 0 ? t("fleetTeam.tabsEmpty") : t("fleetTeam.tabsHint")}
      </p>
    </div>
  );
}
