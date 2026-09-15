// Vendor-portal note #2 (2026-09-15) — "Remove the Grow tab, no need for it
// now."
//
// The route stays and forwards rather than 404ing. /vendor/analytics and
// /vendor/campaigns have redirected here since revision #31, the tab was in
// the rail for four revisions, and a merchant with it bookmarked or sitting in
// an email should land on their orders rather than on a dead page.
import { redirect } from "next/navigation";

export default function RemovedGrowPage() {
  redirect("/vendor");
}
