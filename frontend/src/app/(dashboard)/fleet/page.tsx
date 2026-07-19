"use client";
// Darb 2.0 — /fleet: thin index into the existing driver/attendance/asset
// surfaces (those pages carry over from Darb 1.0 unchanged).
import Link from "next/link";
import { Users, CalendarCheck2, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";

export default function FleetIndexPage() {
  const { t } = useI18n();

  const links = [
    {
      href: "/drivers",
      icon: Users,
      title: t("darbNav.fleetDrivers"),
      desc: t("darbNav.fleetDriversDesc"),
    },
    {
      href: "/attendance",
      icon: CalendarCheck2,
      title: t("darbNav.fleetAttendance"),
      desc: t("darbNav.fleetAttendanceDesc"),
    },
    {
      href: "/assets",
      icon: SlidersHorizontal,
      title: t("darbNav.fleetAssets"),
      desc: t("darbNav.fleetAssetsDesc"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("darbNav.fleet")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("darbNav.fleetSubtitle")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-9 w-9 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <link.icon size={16} aria-hidden="true" />
              </div>
              <DirectionalIcon
                kind="arrow-forward"
                size={15}
                className="text-sand-400 group-hover:text-primary transition-colors"
                aria-hidden="true"
              />
            </div>
            <p className="font-medium text-sand-900 mt-3">{link.title}</p>
            <p className="text-xs text-sand-600 mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
