"use client";
// The six config pages are no longer in the sidebar, so they need a way home.
// One line at the top of each of them.
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";

export default function BackToSetup() {
  const { t } = useI18n();
  return (
    <Link
      href="/setup"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-sand-600 hover:text-sand-900 transition-colors"
    >
      <DirectionalIcon kind="arrow-back" size={14} aria-hidden="true" />
      {t("simple.backToSetup")}
    </Link>
  );
}
