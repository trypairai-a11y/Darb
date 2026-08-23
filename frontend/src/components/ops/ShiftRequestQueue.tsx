"use client";
// Darb 2.0 — the three-hour windows drivers have booked for themselves.
//
// This panel used to be Darb's answer to a request: Approve wrote the Shift,
// Decline needed a reason. Revision 16 (#4) removed the question. Booking a
// shift now confirms it — the request is written APPROVED and the Shift that
// attendance and pay read is created in the same serializable transaction as
// the capacity count, and a window that is full answers WINDOW_FULL rather
// than queueing for a human.
//
// Client report, revision 17 (#3): "still showing shift requests". It was.
// The panel still asked for PENDING and still drew Confirm and Decline, so the
// one screen staff look at implied a decision that nothing upstream was
// waiting on, and any row that did appear was a legacy artifact whose buttons
// would act on an already-settled booking. Allocation is capacity and
// first-come-first-served, so there is nothing here to approve.
//
// What is left is worth showing: who booked what, so a supervisor can see the
// evening filling up. It is a log now, not a queue.
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { shiftRequestsApi, unwrapList, type ShiftRequestRow } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

export default function ShiftRequestQueue() {
  const { t, locale } = useI18n();

  const query = useQuery({
    queryKey: ["darb", "shift-requests", "booked"],
    queryFn: () => shiftRequestsApi.list({ status: "APPROVED", limit: 25 }),
    refetchInterval: 60_000,
  });

  const rows = unwrapList<ShiftRequestRow>(query.data);

  // Nothing booked yet is not worth a heading over the driver list it would
  // push down.
  if (rows.length === 0) return null;

  return (
    <section className="mb-3 rounded-2xl border border-sand-200 bg-card">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-sand-200">
        <CalendarClock size={14} className="text-primary" aria-hidden="true" />
        <h3 className="text-xs font-medium text-sand-900">{t("shiftRequests.bookedTitle")}</h3>
        <span className="ms-auto text-[11px] tabular-nums text-sand-600">{rows.length}</span>
      </header>

      <p className="px-3 pt-2 text-[11px] text-sand-600">{t("shiftRequests.autoHint")}</p>

      <ul data-testid="ops-shift-request-queue" className="divide-y divide-sand-200">
        {rows.map((row) => (
          <li key={row.id} className="px-3 py-2.5">
            <p dir="auto" className="text-xs font-medium text-sand-900 truncate">
              {row.driver?.name ?? "n/a"}
            </p>
            <p className="text-[11px] text-sand-600">
              <span dir="ltr" className="tabular-nums">
                {formatDate(row.date, locale)} · {row.startTime}-{row.endTime}
              </span>
              {" · "}
              <span dir="auto">{row.zoneName}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
