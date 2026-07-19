"use client";
// Darb 2.0 — /ops/* layout (wave 2). Two jobs:
//   1. Guard: supervisor-and-above only (VENDOR/ACCOUNTANT/VIEWER bounce home).
//   2. IncidentAlertBanner on every ops surface — floats over the content and
//      is driven by the oldest un-acknowledged OPEN SOS incident (10s polling
//      backstop; the SOS console adds SSE on top).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import IncidentAlertBanner from "@/components/darb/IncidentAlertBanner";
import { useToast } from "@/components/shared/Toast";
import { incidentsApi, unwrapList } from "@/lib/darbApi";
import type { Incident } from "@/types/darb";
import { useRole } from "@/hooks/useRole";
import { useI18n } from "@/i18n/I18nProvider";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const { hasRole } = useRole();
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [acking, setAcking] = useState(false);

  const allowed = hasRole("SUPERVISOR");

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  const incidentsQuery = useQuery({
    queryKey: ["darb", "incidents", "live"],
    queryFn: () => incidentsApi.list({ limit: 50 }),
    refetchInterval: 10_000,
    enabled: allowed,
  });

  const openUnacked = useMemo(() => {
    const incidents = unwrapList<Incident>(incidentsQuery.data);
    return (
      incidents
        .filter((i) => i.status === "OPEN")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ??
      null
    );
  }, [incidentsQuery.data]);

  async function acknowledge(id: string) {
    setAcking(true);
    try {
      await incidentsApi.ack(id);
      toast.success(t("opsPages.incidentAcked"));
      await queryClient.invalidateQueries({ queryKey: ["darb", "incidents"] });
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setAcking(false);
    }
  }

  if (!allowed) return null;

  return (
    <>
      {openUnacked && (
        <div className="fixed top-20 inset-x-4 z-40 sm:inset-x-auto sm:end-8 sm:w-[30rem] max-w-full">
          <IncidentAlertBanner
            incident={openUnacked}
            onAcknowledge={(id) => void acknowledge(id)}
            acknowledging={acking}
          />
        </div>
      )}
      {children}
    </>
  );
}
