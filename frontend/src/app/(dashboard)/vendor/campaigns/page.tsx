// Merged into the merchant Grow screen (revision #31), then cut entirely: the
// Messages tab could not send and its drafts never left the browser. Kept as a
// redirect so old bookmarks and notification links still land somewhere real.
import { redirect } from "next/navigation";

export default function VendorCampaignsRedirect() {
  redirect("/vendor/grow");
}
