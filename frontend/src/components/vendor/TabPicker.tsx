"use client";
// Revision 10 (#6) — which tabs one shop login can open.
//
// Asked for three revisions running and still missing: the Team page could set a
// role and a branch and nothing else, so a shop that wanted its accountant kept
// out of Grow, or a branch supervisor limited to orders, could not say so. A
// role is a bundle, and every shop draws the line somewhere different.
//
// Two modes on purpose. "Whatever the role opens" is the default and is what
// every existing login does, so nothing changes for anyone until an owner
// deliberately narrows somebody. "Choose the tabs" replaces that with an
// explicit list. The server keeps the same distinction: a null column means
// inherit, an array means this exactly.
import { VENDOR_TAB_ORDER, roleDefaultTabs } from "@/lib/vendorTabs";
import type { VendorPortalRole, VendorTab } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

interface TabPickerProps {
  /** The role, which decides what "inherit" resolves to in the preview. */
  vendorRole: VendorPortalRole;
  /** null = inherit the role's tabs. An array = this exact list. */
  value: VendorTab[] | null;
  onChange: (next: VendorTab[] | null) => void;
}

export default function TabPicker({ vendorRole, value, onChange }: TabPickerProps) {
  const { t } = useI18n();
  const custom = value !== null;
  const effective = value ?? roleDefaultTabs(vendorRole);

  const toggle = (tab: VendorTab) => {
    const next = effective.includes(tab)
      ? effective.filter((x) => x !== tab)
      : VENDOR_TAB_ORDER.filter((x) => x === tab || effective.includes(x));
    onChange(next);
  };

  return (
    <div>
      <span className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
        {t("vendorTeam.tabs")}
      </span>

      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit mb-3">
        {[
          { key: "inherit", label: t("vendorTeam.tabsInherit"), on: !custom },
          { key: "custom", label: t("vendorTeam.tabsCustom"), on: custom },
        ].map((mode) => (
          <button
            key={mode.key}
            type="button"
            // Switching to custom starts from what the role already opens, so an
            // owner narrows a working set rather than building one from nothing.
            onClick={() => onChange(mode.key === "custom" ? roleDefaultTabs(vendorRole) : null)}
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
        {VENDOR_TAB_ORDER.map((tab) => {
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
              {t(`vendorTeam.tab${tab}`)}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-sand-600">
        {custom && effective.length === 0
          ? t("vendorTeam.tabsEmpty")
          : t("vendorTeam.tabsHint")}
      </p>
    </div>
  );
}
