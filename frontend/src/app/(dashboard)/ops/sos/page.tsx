// Merged into the Live screen (revision #31). Kept as a redirect so bookmarks,
// notification links and anything else pointing here still lands on the right
// segment.
import { redirect } from "next/navigation";

export default function SosRedirect() {
  redirect("/ops?view=emergency");
}
