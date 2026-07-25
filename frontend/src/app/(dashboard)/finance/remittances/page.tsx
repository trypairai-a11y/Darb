// Merged into the Money screen (revision #31). Kept as a redirect so
// bookmarks, notification links and the old stat-card deep links still work.
import { redirect } from "next/navigation";

export default function RemittancesRedirect() {
  redirect("/finance?tab=cash");
}
