"use client";
// The config pages are not in the sidebar, so they need a way home. One line
// at the top of each of them.
//
// Revision 21c: home is the TAB that owns the page, never the old /setup hub.
// The client went back from Shops and landed on a screen the layout no longer
// has. /vendors and /fleets are reached from the Admin dashboard; /requests
// from Ops. The rail's `owns` lists say the same, so the highlight agrees.
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";

const HOME: Record<"admin" | "ops", { href: string; i18n: string }> = {
  admin: { href: "/admin", i18n: "hq.admin" },
  ops: { href: "/ops", i18n: "hq.ops" },
};

export default function BackToSetup({ tab = "admin" }: { tab?: "admin" | "ops" }) {
  const { t } = useI18n();
  const home = HOME[tab];
  return (
    <Link
      href={home.href}
      data-testid="back-to-tab"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-sand-600 hover:text-sand-900 transition-colors"
    >
      <DirectionalIcon kind="arrow-back" size={14} aria-hidden="true" />
      {t("simple.backTo").replace("{tab}", t(home.i18n))}
    </Link>
  );
}
