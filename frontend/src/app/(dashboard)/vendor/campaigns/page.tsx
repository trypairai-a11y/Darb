// Merged into the merchant Grow screen (revision #31). Kept as a redirect so
// bookmarks and anything else pointing here still lands on the right tab.
import { redirect } from "next/navigation";

export default function VendorCampaignsRedirect() {
  redirect("/vendor/grow?tab=messages");
}
