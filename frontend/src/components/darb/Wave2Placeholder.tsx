// Darb 2.0 — minimal placeholder card for surfaces owned by wave 2
// (/ops/* live control room, /vendor/* portal). Keeps nav links and
// PortalGuard landings from 404ing.
"use client";
import { Construction } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export default function Wave2Placeholder({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="max-w-xl">
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 flex flex-col items-center text-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Construction size={22} aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{title}</h1>
          <p className="text-sm text-sand-600 mt-2">{t("darbNav.comingSoonBody")}</p>
        </div>
      </div>
    </div>
  );
}
