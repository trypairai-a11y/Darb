"use client";
// Darb 2.0 — company switcher for fleet logins that cover several commonly
// owned companies (client revision #15/#27).
//
// Sidra, Marina and Nakheel are the same owners, and they asked to stop
// logging out of one company to look at another. One account now reaches all
// of them and this switches which company the portal is reading. It renders
// nothing at all for a login that only covers one company, so nothing changes
// for existing single-company fleet users.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import api, { getActiveFleetPartnerId, setActiveFleetPartnerId } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

interface FleetCompany {
  id: string;
  name: string;
  disciplineStatus: string;
}

export default function CompanySwitcher() {
  const { user } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(getActiveFleetPartnerId());
  }, []);

  const companiesQuery = useQuery({
    queryKey: ["darb", "fleet", "companies"],
    queryFn: async () => {
      const { data } = await api.get<{
        activeFleetPartnerId: string | null;
        partners: FleetCompany[];
      }>("/api/fleet/companies");
      return data;
    },
    enabled: user?.role === "FLEET",
    staleTime: 5 * 60_000,
  });

  const partners = companiesQuery.data?.partners ?? [];
  // One company is not a choice — don't put a dead control in the header.
  if (user?.role !== "FLEET" || partners.length < 2) return null;

  const active =
    partners.find((p) => p.id === activeId) ??
    partners.find((p) => p.id === companiesQuery.data?.activeFleetPartnerId) ??
    partners[0];

  function select(partner: FleetCompany) {
    setActiveFleetPartnerId(partner.id);
    setActiveId(partner.id);
    setOpen(false);
    // Everything the portal shows is scoped to the partner, so drop the cache
    // rather than leaving the previous company's roster on screen.
    void queryClient.invalidateQueries();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 px-3 h-9 rounded-pill border border-sand-300 bg-white text-sm text-sand-800 hover:border-sand-400 transition-colors"
      >
        <Building2 size={14} className="text-sand-500" aria-hidden="true" />
        <span className="max-w-[160px] truncate" dir="auto">
          {active.name}
        </span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={cn("text-sand-500 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            role="listbox"
            className="absolute end-0 top-full mt-1 z-50 min-w-[220px] bg-white border border-sand-300 rounded-xl shadow-lift py-1"
          >
            <li className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-sand-500">
              {t("fleetPortal.switchCompany")}
            </li>
            {partners.map((partner) => (
              <li key={partner.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={partner.id === active.id}
                  onClick={() => select(partner)}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-start hover:bg-sand-100 transition-colors",
                    partner.id === active.id && "text-primary font-medium"
                  )}
                  dir="auto"
                >
                  {partner.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
