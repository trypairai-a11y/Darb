"use client";
import Link from "next/link";
import { Building2, Store, Target } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export default function AmericanaSettingsPage() {
  const { t } = useI18n();
  const SECTIONS = [
    { href: "/americana/settings/chains", label: t("americana.secChains"), blurb: t("americana.secChainsBlurb"), icon: Building2 },
    { href: "/americana/settings/stores", label: t("americana.secStores"), blurb: t("americana.secStoresBlurb"), icon: Store },
    { href: "/americana/settings/targets", label: t("americana.secTargets"), blurb: t("americana.secTargetsBlurb"), icon: Target },
  ];
  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-americana" />
        <h1 className="text-xl font-semibold">{t("americana.settingsTitle")}</h1>
      </div>
      <p className="text-sm text-secondary">
        {t("americana.settingsIntro")}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:border-americana/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-americana/10 text-americana flex items-center justify-center">
                <s.icon size={18} />
              </div>
              <h2 className="text-base font-semibold">{s.label}</h2>
            </div>
            <p className="text-sm text-secondary">{s.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
