"use client";
// Revision 13 (#2) — the import button on every document panel.
//
// The client reported that Add document has no way to attach the actual file,
// only a type and an expiry date. The picker existed; it was rendered behind
// `{storageConfigured && ...}` on the driver profile and the company documents
// page, and R2 is not configured on the production API, so in production it
// simply was not there. The roster's Add driver panel rendered its picker
// unconditionally, so the three screens already disagreed with each other.
//
// One field, used by all three, ALWAYS rendered. When storage is off it is
// disabled and says why, instead of vanishing and leaving a panel that looks
// unfinished. Nothing is faked: with storage off the submission still carries
// the type and the expiry, and the documents table keeps saying "No file" for
// that row, because that is the truth. The day R2 is configured the field goes
// live with no code change, since `storageConfigured` comes from the server on
// every payload.
import { Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

/** What the API accepts. Kept in step with the presign endpoint's allow-list. */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export default function DocumentFileField({
  file,
  onChange,
  storageConfigured,
  compact = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  storageConfigured: boolean;
  /** Sits beside an expiry input on the Add driver panel rather than under it. */
  compact?: boolean;
}) {
  const { t } = useI18n();

  const label = file
    ? compact
      ? file.name.slice(0, 14)
      : file.name
    : t("fleetPortal.importFile");

  return (
    <div className={compact ? "shrink-0" : "space-y-1.5"}>
      <label
        className={cn(
          "inline-flex items-center gap-2 h-10 px-3 rounded-xl border text-sm",
          compact ? "text-xs" : "w-full",
          storageConfigured
            ? "border-sand-300 text-sand-700 cursor-pointer hover:bg-sand-100"
            : "border-sand-200 bg-sand-50 text-sand-400 cursor-not-allowed",
        )}
      >
        <Upload size={compact ? 14 : 15} aria-hidden="true" />
        <span dir="auto">{label}</span>
        <input
          type="file"
          className="hidden"
          accept={ACCEPT}
          disabled={!storageConfigured}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {!storageConfigured && !compact && (
        <p className="text-xs text-sand-500" dir="auto">
          {t("fleetPortal.importOff")}
        </p>
      )}
    </div>
  );
}
