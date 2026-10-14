"use client";
// Revision 24 (#8): "in the driver profile, there must be a checkbox for
// whether he is eligible for Private Shifts or not." Off by default; the
// driver app offers private shifts only when it is on.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/shared/Toast";
import { privateShiftsApi } from "@/lib/privateShiftsApi";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";

export default function DriverPrivateShiftToggle({ driverId }: { driverId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canEdit = hasRole("OPS_MANAGER");
  const key = ["darb", "driver-private-eligibility", driverId];

  const query = useQuery({ queryKey: key, queryFn: () => privateShiftsApi.driverEligibility(driverId) });
  const mutation = useMutation({
    mutationFn: (eligible: boolean) => privateShiftsApi.setDriverEligibility(driverId, eligible),
    onSuccess: (res) => {
      toast.success(t(res.privateShiftEligible ? "privateShifts.eligibleOn" : "privateShifts.eligibleOff"));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error(t("errors.savingData")),
  });
  if (!query.data) return null;

  return (
    <label
      className="flex items-center gap-3 rounded-lg border border-sand-200 bg-white px-4 py-3 text-sm"
      data-testid="driver-private-eligible"
    >
      <input
        type="checkbox"
        checked={query.data.privateShiftEligible}
        disabled={!canEdit || mutation.isPending}
        onChange={(e) => mutation.mutate(e.target.checked)}
      />
      <span className="font-medium text-sand-900">{t("privateShifts.eligibleLabel")}</span>
      <span className="text-sand-600">{t("privateShifts.eligibleHint")}</span>
    </label>
  );
}
