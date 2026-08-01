/**
 * strings.ts — flat dictionaries + t() helper with a language switch.
 *
 * Two dictionaries keyed identically: EN (this file, also the fallback) and AR
 * (./ar.ts). t() reads a module-level active dictionary with per-key EN
 * fallback; the persisted language store (src/store/languageStore.ts) calls
 * setLanguage() on hydrate and on user change, and the root layout re-keys the
 * navigator so every mounted screen re-renders.
 *
 * Layout stays LTR by design (I18nManager.allowRTL(false) at boot); Arabic
 * strings render right-to-left inside Text naturally.
 *
 * Interpolation: t("pod.collect", { amount: "KD 3.500" }) replaces {amount}.
 */

import AR from "./ar";

const EN: Record<string, string> = {
  // ─── Common ───
  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.retry": "Retry",
  "common.back": "Back",
  "common.submit": "Submit",
  "common.loading": "Loading…",
  "common.offline_note": "You appear to be offline",
  "common.call_supervisor": "Call supervisor",
  "common.syncing": "Syncing {count}…",

  // ─── Enrollment / boot ───
  "enroll.kicker": "DARB DRIVER",
  "enroll.title": "Start your shift with confidence.",
  "enroll.subtitle": "Enter your Darb ID and the phone number registered with Darb.",
  "enroll.placeholder": "Darb ID, for example DRB-0065",
  "enroll.phone_placeholder": "Phone number",
  "enroll.hint": "Your Darb ID is on the driver roster. Your supervisor can read it to you.",
  "enroll.cta": "Enroll device",
  "enroll.cta_busy": "Enrolling…",
  "enroll.demo": "Use demo driver",
  "enroll.failed_title": "Enrollment failed",
  "enroll.failed_body": "Check your Darb ID and phone number and try again",

  // ─── Tabs ───
  "tabs.home": "Home",
  "tabs.wallet": "Wallet",
  "tabs.history": "History",
  "tabs.shifts": "Shifts",
  "tabs.alerts": "Alerts",

  // ─── Shifts (client request 2026-08-01) ───
  "shifts.title": "Shifts",
  "shifts.subtitle": "Your schedule, and asking for more of it.",
  "shifts.upcoming": "Coming up",
  "shifts.past": "Earlier",
  "shifts.none_upcoming": "No shifts booked yet. Ask for one below.",
  "shifts.request_title": "Ask for a shift",
  "shifts.request_hint": "Darb confirms it and it appears above.",
  "shifts.field_date": "Date, e.g. 2026-08-05",
  "shifts.field_from": "From, e.g. 16:00",
  "shifts.field_to": "To, e.g. 23:00",
  "shifts.field_area": "Area (optional)",
  "shifts.request_button": "Send request",
  "shifts.request_sent": "Sent. Darb will confirm it.",
  "shifts.request_failed": "Could not send the request",

  // ─── Rider support (client request 2026-08-01) ───
  "support.title": "Rider support",
  "support.new_title": "Ask for help",
  "support.new_hint": "For anything that is not an emergency. Use SOS if you are in danger.",
  "support.field_title": "What is it about?",
  "support.field_description": "Tell us what happened",
  "support.send": "Send",
  "support.sent": "Sent. Darb will get back to you.",
  "support.failed": "Could not send it",
  "support.mine": "Your requests",
  "support.none": "You have not asked for anything yet.",
  "support.cat_VEHICLE_REPAIR": "Bike",
  "support.cat_EQUIPMENT_REQUEST": "Kit",
  "support.cat_SALARY_ISSUE": "Pay",
  "support.cat_COMPLAINT": "Complaint",
  "support.cat_LEAVE_REQUEST": "Leave",
  "support.cat_TRANSFER_REQUEST": "Transfer",
  "support.cat_ACCIDENT_REPORT": "Accident",
  "support.cat_SHIFT_REQUEST": "Shift",
  "support.cat_OTHER": "Other",

  // ─── Notifications (client request 2026-08-01) ───
  "alerts.title": "Notifications",
  "alerts.empty": "Nothing yet. New deliveries and cash updates show up here.",
  "alerts.just_now": "Just now",
  "alerts.mins_ago": "{count} min ago",
  "alerts.hours_ago": "{count} h ago",

  // ─── Home / availability ───
  "home.status.online": "Online",
  "home.status.busy": "Busy",
  "home.status.offline": "Offline",
  "home.waiting": "Waiting for offers…",
  "home.waiting_sub": "Stay near your zone. New offers ring loudly.",
  "home.offline_hint": "Go online to start receiving delivery offers.",
  "home.busy_hint": "Finish your current delivery to receive new offers.",
  "home.today": "Today",
  "home.deliveries": "Deliveries",
  "home.collected": "Collected",
  "home.cash_on_hand": "Cash on hand",
  "home.resume_delivery": "Resume delivery",
  "home.lockout_title": "Offers paused — cash over ceiling",
  "home.lockout_body": "Deposit your cash at the hub to resume receiving offers.",
  "home.permission_warning": "Location permission needed",
  "home.permission_warning_sub": "Offers require background location. Tap to fix.",
  "home.permission_ok": "Location sharing active",
  "home.availability_error": "Could not change status",

  // ─── Offer ───
  "offer.title": "New delivery offer",
  "offer.pickup": "Pickup",
  "offer.dropoff": "Drop-off",
  "offer.distance": "{km} km",
  "offer.cod": "Collect cash",
  "offer.prepaid": "Prepaid",
  "offer.accept": "Accept",
  "offer.reject": "Reject",
  "offer.accepting": "Accepting…",
  "offer.expired": "Offer expired",
  "offer.expired_sub": "It was offered to another driver.",

  // ─── Delivery ───
  "delivery.title": "Active delivery",
  "arrival.title": "At the restaurant",
  "arrival.hint": "Take a photo at the restaurant as proof you arrived. Darb needs it if the pickup time is ever questioned.",
  "arrival.take_photo": "Take arrival photo",
  "arrival.confirm": "Confirm I'm at the restaurant",
  "delivery.stage.HEADING_TO_PICKUP": "Heading to restaurant",
  "delivery.stage.ARRIVED_AT_PICKUP": "At the restaurant",
  "delivery.stage.PICKED_UP": "Order picked up",
  "delivery.stage.ARRIVED_AT_DROPOFF": "At the customer",
  "delivery.next.HEADING_TO_PICKUP": "I've arrived at the restaurant",
  "delivery.next.ARRIVED_AT_PICKUP": "I've picked up the order",
  "delivery.next.PICKED_UP": "I've arrived at the customer",
  "delivery.next.ARRIVED_AT_DROPOFF": "Complete delivery",
  "delivery.sla_remaining": "{time} to deadline",
  "delivery.sla_overdue": "Overdue by {time}",
  "delivery.cod_title": "Cash on delivery",
  "delivery.cod_body": "Collect {amount} from the customer",
  "delivery.navigate": "Navigate",
  "delivery.call_customer": "Call customer",
  "delivery.failed_link": "Delivery failed",
  "delivery.no_order": "No active delivery",
  "delivery.no_order_sub": "Go online from Home to receive offers.",

  // ─── POD ───
  "pod.title": "Complete delivery",
  "pod.collect": "Collect {amount}",
  "pod.collect_confirm": "I have collected the full amount in cash",
  "pod.method_photo": "Photo",
  "pod.photo_hint": "Photograph the order at the customer's door",
  "pod.take_photo": "Take photo",
  "pod.retake": "Retake",
  "pod.confirm_delivery": "Confirm delivery",
  "pod.submitting": "Confirming…",
  "pod.delivered": "Delivered",
  "pod.delivered_queued": "Delivered — proof will sync automatically",

  // ─── Failed ───
  "failed.title": "Delivery failed",
  "failed.subtitle": "Choose what happened. The supervisor will be notified.",
  "failed.reason.CUSTOMER_UNREACHABLE": "Customer unreachable",
  "failed.reason.WRONG_ADDRESS": "Wrong address",
  "failed.reason.CUSTOMER_REFUSED": "Customer refused the order",
  "failed.reason.OTHER": "Other",
  "failed.note_placeholder": "Add a short note…",
  "failed.submit": "Report failed delivery",

  // ─── Wallet ───
  "wallet.title": "Wallet",
  "wallet.today": "Collected today",
  "wallet.cash_on_hand": "Cash on hand",
  "wallet.ceiling": "of {ceiling} ceiling",
  "wallet.lockout_title": "Cash ceiling reached",
  "wallet.lockout_body": "Offers are paused. Hand in cash at the hub to resume.",
  "wallet.remittances": "Remittance history",
  "wallet.no_remittances": "No remittances yet",
  "wallet.tips": "Tips",
  "wallet.tips_today": "Tips today",
  "wallet.tips_total": "Tips total",
  "wallet.tips_note": "Tips are yours. You keep 100%.",

  // ─── History ───
  "history.title": "History",
  "history.empty": "No past deliveries",
  "history.empty_sub": "Completed deliveries from the last 7 days appear here.",

  // ─── SOS ───
  "sos.title": "Emergency report",
  "sos.subtitle": "What happened? Your live location is attached automatically.",
  "sos.cat.ACCIDENT": "Accident",
  "sos.cat.BREAKDOWN": "Vehicle breakdown",
  "sos.cat.CUSTOMER_AGGRESSION": "Customer aggression",
  "sos.cat.ROAD_BLOCKAGE": "Road blockage",
  "sos.add_photos": "Add photos ({count}/3)",
  "sos.describe": "Describe what happened (optional)",
  "sos.send": "Send report",
  "sos.sending": "Sending…",
  "sos.sent_title": "Supervisor notified",
  "sos.sent_body": "Stay safe. Your report and location were sent.",
  "sos.acked": "Supervisor has seen your report",
  "sos.queued_title": "Report will send automatically",
  "sos.queued_body": "You're offline — the report is queued. Call your supervisor now.",

  // ─── Darb Points ───
  "points.title": "Darb Points",
  "points.overall": "Overall score",
  "points.breakdown": "Score breakdown",
  "points.attendance": "Attendance",
  "points.orders": "Orders",
  "points.hours": "Hours",
  "points.violations": "Violations",
  "points.stats": "This month",
  "points.stat_on_time": "On-time rate",
  "points.stat_orders": "Orders completed",
  "points.stat_hours": "Hours worked",
  "points.stat_violations": "Violations",
  "points.trend": "Recent months",
  "points.empty": "No score yet",
  "points.empty_sub": "Your score appears after your first scored month.",
  "points.error": "Couldn't load your points",
  "points.error_sub": "Check your connection and try again.",
  "points.updated": "Updated {date}",

  // ─── Web (browser build) ───
  "web.keep_tab_open": "Keep this tab open while on shift. GPS tracking pauses when the tab is hidden or closed.",
  "web.location_denied": "Location is blocked in your browser. Allow location access for this site so the office can track your shift.",

  // ─── Settings ───
  "settings.title": "Settings",
  "settings.profile": "Driver",
  "settings.device": "Device",
  "settings.permissions": "Permissions",
  "settings.location_permission": "Location sharing",
  "settings.notifications_permission": "Notifications",
  "settings.fix": "Fix",
  "settings.granted": "Granted",
  "settings.open_settings": "Open system settings",
  "settings.sign_out": "Sign out",
  "settings.sign_out_title": "Sign out",
  "settings.sign_out_body": "You'll need your enrollment code to sign back in. GPS tracking will stop.",
  "settings.language": "Language / اللغة",
  "settings.lang_en": "English",
  "settings.lang_ar": "العربية",
  "settings.my_points": "My Darb Points",
};

export type Lang = "en" | "ar";

const DICTS: Record<Lang, Record<string, string>> = { en: EN, ar: AR };

let activeLang: Lang = "en";

/** Switch the active dictionary. Callers re-render via the language store. */
export function setLanguage(lang: Lang): void {
  activeLang = lang === "ar" ? "ar" : "en";
}

export function getLanguage(): Lang {
  return activeLang;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[activeLang][key] ?? EN[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

export default EN;
