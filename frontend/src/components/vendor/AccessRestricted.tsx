"use client";
// Revision 9, edits 9 and 11.
//
// A shop user who opens a tab their role cannot reach met "Something went
// wrong — Request failed with status code 403" and a Try again button that
// could never work. Nothing went wrong: they are simply not allowed in, and
// retrying will not change that. This says so, and points at the person who
// can change it, which is their own owner rather than Darb.
import { Lock } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export default function AccessRestricted() {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-sand-200 rounded-2xl shadow-soft px-6 py-14 text-center">
      <div className="mx-auto mb-4 h-11 w-11 rounded-pill bg-sand-100 flex items-center justify-center text-sand-600">
        <Lock size={18} aria-hidden="true" />
      </div>
      <p className="font-medium text-sand-900">{t("vendorPortal.accessRestricted")}</p>
      <p className="text-sm text-sand-600 mt-1.5 max-w-sm mx-auto">
        {t("vendorPortal.accessRestrictedHint")}
      </p>
    </div>
  );
}
