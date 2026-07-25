// Renamed to /vendor/grow (revision #31), for two reasons.
//
// The obvious one: the screen is called Grow now, so the URL should say so.
//
// The other one is the reason it is a redirect rather than a rename in place.
// Ad and tracker blockers match on URL substrings, and a path segment called
// "analytics" is a very common rule. With the page chunk served from
// /_next/static/chunks/app/(dashboard)/vendor/analytics/page-<hash>.js, a
// blocked request meant a ChunkLoadError and a blank screen for any merchant
// running a blocker. Verified in a real browser: the server returned the
// chunk 200 while the browser refused to fetch it, and the sibling chunk one
// directory up loaded fine. Renaming the segment sidesteps the whole class.
import { redirect } from "next/navigation";

export default function VendorAnalyticsRedirect({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  redirect(searchParams.tab ? `/vendor/grow?tab=${searchParams.tab}` : "/vendor/grow");
}
