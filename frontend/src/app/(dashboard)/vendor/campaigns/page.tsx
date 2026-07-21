"use client";
// Darb 2.0 PRD build — /vendor/campaigns: phase-2-ready WhatsApp campaigns UI.
// Sending is blocked until the WhatsApp Business account clears approval, so
// the page lets vendors pick a template, shape an audience + schedule, and
// save DRAFTS to localStorage. The Send button stays disabled by design.
import { useEffect, useState } from "react";
import { CalendarClock, Megaphone, Send, Trash2, TriangleAlert, Users } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const DRAFTS_KEY = "darb.vendor.campaignDrafts";

type TemplateKey = "winback" | "newArrival" | "weekend";
type AudienceKey = "lapsed" | "all" | "loyal";

interface CampaignDraft {
  id: string;
  template: TemplateKey;
  audience: AudienceKey;
  scheduleAt: string;
  createdAt: string;
}

const TEMPLATES: { key: TemplateKey; titleKey: string; bodyKey: string }[] = [
  { key: "winback", titleKey: "campaigns.templateWinback", bodyKey: "campaigns.templateWinbackBody" },
  { key: "newArrival", titleKey: "campaigns.templateNewArrival", bodyKey: "campaigns.templateNewArrivalBody" },
  { key: "weekend", titleKey: "campaigns.templateWeekend", bodyKey: "campaigns.templateWeekendBody" },
];

const AUDIENCES: { key: AudienceKey; labelKey: string }[] = [
  { key: "lapsed", labelKey: "campaigns.audienceLapsed" },
  { key: "all", labelKey: "campaigns.audienceAll" },
  { key: "loyal", labelKey: "campaigns.audienceLoyal" },
];

function loadDrafts(): CampaignDraft[] {
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CampaignDraft[]) : [];
  } catch {
    return [];
  }
}

function persistDrafts(drafts: CampaignDraft[]) {
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Storage unavailable: drafts stay in memory for the session.
  }
}

export default function VendorCampaignsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [selected, setSelected] = useState<TemplateKey | null>(null);
  const [audience, setAudience] = useState<AudienceKey>("lapsed");
  const [scheduleAt, setScheduleAt] = useState("");
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);

  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  function templateTitle(key: TemplateKey): string {
    const tpl = TEMPLATES.find((x) => x.key === key);
    return tpl ? t(tpl.titleKey) : key;
  }

  function audienceLabel(key: AudienceKey): string {
    const a = AUDIENCES.find((x) => x.key === key);
    return a ? t(a.labelKey) : key;
  }

  function saveDraft() {
    if (!selected) return;
    const next: CampaignDraft[] = [
      ...drafts,
      {
        id: Math.random().toString(36).slice(2),
        template: selected,
        audience,
        scheduleAt,
        createdAt: new Date().toISOString(),
      },
    ];
    setDrafts(next);
    persistDrafts(next);
    setSelected(null);
    setScheduleAt("");
    toast.success(t("campaigns.draftSaved"));
  }

  function deleteDraft(id: string) {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    persistDrafts(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("campaigns.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("campaigns.subtitle")}</p>
      </div>

      {/* Pending-approval banner */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-200 bg-amber-50">
        <TriangleAlert size={17} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-amber-800">{t("campaigns.pendingApproval")}</p>
          <p className="text-xs text-amber-700 mt-0.5">{t("campaigns.pendingBody")}</p>
        </div>
      </div>

      {/* Templates */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-sand-900">{t("campaigns.templatesTitle")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => setSelected(selected === tpl.key ? null : tpl.key)}
              className={cn(
                "text-start bg-card border rounded-2xl p-5 shadow-soft transition-all duration-250 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]",
                selected === tpl.key
                  ? "border-primary ring-2 ring-primary/15"
                  : "border-sand-200"
              )}
              aria-pressed={selected === tpl.key}
            >
              <div className="h-9 w-9 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 mb-3">
                <Megaphone size={16} aria-hidden="true" />
              </div>
              <p className="font-medium text-sand-900">{t(tpl.titleKey)}</p>
              <p className="text-xs text-sand-600 mt-1 leading-relaxed">{t(tpl.bodyKey)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Draft form (opens when a template is selected) */}
      {selected && (
        <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 space-y-4 max-w-lg">
          <p className="text-sm font-medium text-sand-900">{templateTitle(selected)}</p>
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              <Users size={12} aria-hidden="true" />
              {t("campaigns.audience")}
            </span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceKey)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {AUDIENCES.map((a) => (
                <option key={a.key} value={a.key}>
                  {t(a.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              <CalendarClock size={12} aria-hidden="true" />
              {t("campaigns.schedule")}
            </span>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              {t("campaigns.saveDraft")}
            </button>
            {/* Send stays disabled until the WhatsApp Business account clears. */}
            <button
              type="button"
              disabled
              title={t("campaigns.pendingApproval")}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-sand-100 text-sand-500 text-sm font-medium cursor-not-allowed"
            >
              <Send size={13} aria-hidden="true" />
              {t("campaigns.send")}
            </button>
            <span className="text-[11px] text-sand-500">{t("campaigns.pendingApproval")}</span>
          </div>
        </section>
      )}

      {/* Drafts */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
        <header className="px-5 py-4 border-b border-sand-200">
          <h2 className="text-sm font-medium text-sand-900">{t("campaigns.drafts")}</h2>
        </header>
        {drafts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-sand-600">{t("campaigns.noDrafts")}</p>
        ) : (
          <ul className="divide-y divide-sand-200">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-sand-900 truncate">{templateTitle(d.template)}</p>
                  <p className="text-xs text-sand-600 mt-0.5">
                    {audienceLabel(d.audience)}
                    {d.scheduleAt && (
                      <span dir="ltr" className="ms-2 tabular-nums">
                        {formatDateTime(d.scheduleAt, locale)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteDraft(d.id)}
                  className="p-2 rounded-pill text-sand-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label={t("common.delete")}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
