"use client";
// Darb 2.0 — /vendor/grow: the merchant Grow screen.
//
// Revision #31 folded Analytics and Campaigns into one screen with two tabs,
// because they answered the same question: "how do I sell more". The Messages
// tab is gone now. It could not send: the button was disabled pending WhatsApp
// Business approval, and drafts lived in localStorage, so a merchant could
// build a campaign that went nowhere and vanished on the next device. A tab
// that cannot do its job is worse than no tab. Grow is the numbers, and with
// only one thing left the tab strip went with it.
//
// /vendor/campaigns and /vendor/analytics both still redirect in here, so
// nothing that linked to either breaks.
import AnalyticsPanel from "@/components/vendor/AnalyticsPanel";
import { useI18n } from "@/i18n/I18nProvider";

export default function VendorGrowPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("simple.grow")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("simple.growSubtitle")}</p>
      </div>

      <AnalyticsPanel />
    </div>
  );
}
