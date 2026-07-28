// Merged into the Money screen (revision #31), then split back out into its
// own portal (revision 4 #3). Two moves, one surviving bookmark: this now
// forwards straight to the cash desk rather than through /finance?tab=cash.
import { redirect } from "next/navigation";

export default function RemittancesRedirect() {
  redirect("/cash-desk");
}
