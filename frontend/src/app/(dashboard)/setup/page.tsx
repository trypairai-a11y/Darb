"use client";
// Darb 2.0 — /setup: the hub for everything you configure once and rarely
// touch again. Zones, pricing, vendors, fleets, staff accounts and equipment
// used to occupy six of the sixteen rail slots even though nobody opens them
// on a normal day. They now live behind this one door, unmodified: the hub is
// pure navigation, so nothing about those pages had to change.
import Link from "next/link";
import { Hexagon, Coins, Store, Truck, ShieldCheck, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";

interface SetupCard {
  href: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
}

const CARDS: SetupCard[] = [
  {
    href: "/zones",
    icon: Hexagon,
    titleKey: "simple.setupAreas",
    descKey: "simple.setupAreasDesc",
  },
  {
    href: "/pricing",
    icon: Coins,
    titleKey: "simple.setupPrices",
    descKey: "simple.setupPricesDesc",
  },
  {
    href: "/vendors",
    icon: Store,
    titleKey: "simple.setupShops",
    descKey: "simple.setupShopsDesc",
  },
  {
    href: "/fleets",
    icon: Truck,
    titleKey: "simple.setupCompanies",
    descKey: "simple.setupCompaniesDesc",
  },
  {
    href: "/settings",
    icon: ShieldCheck,
    titleKey: "simple.setupPeople",
    descKey: "simple.setupPeopleDesc",
  },
  {
    href: "/assets",
    icon: Package,
    titleKey: "simple.setupEquipment",
    descKey: "simple.setupEquipmentDesc",
  },
];

export default function SetupPage() {
  const { t } = useI18n();
  const { canManageSettings } = useRole();

  // The rail already gates /setup at OPS_MANAGER; this is the in-page mirror
  // of that gate for anyone who arrives by URL.
  if (!canManageSettings) {
    return (
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
        <p className="text-sm text-sand-600">{t("errors.permissionDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("simple.setupTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("simple.setupSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-10 w-10 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <card.icon size={18} aria-hidden="true" />
              </div>
              <DirectionalIcon
                kind="arrow-forward"
                size={15}
                className="text-sand-400 group-hover:text-primary transition-colors"
                aria-hidden="true"
              />
            </div>
            <p className="font-medium text-sand-900 mt-3">{t(card.titleKey)}</p>
            <p className="text-xs text-sand-600 mt-1">{t(card.descKey)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
