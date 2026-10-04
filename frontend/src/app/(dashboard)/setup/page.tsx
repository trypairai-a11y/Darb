// Revision 21c (client note, 2026-09-21): "when I go back from some pages this
// page appears, must not be there, you already changed the layout".
//
// /setup was the pre-revision-20 hub for the seven configuration screens. Every
// one of them has a home inside the four tabs now (areas and equipment under
// Ops, prices, people, shops and delivery companies under Admin), and the
// Admin dashboard already lists the shops and delivery companies the hub was
// last reached back from. The route is kept so bookmarks resolve; it lands on
// Admin, the tab the rail says owns it.
import { redirect } from "next/navigation";

export default function SetupRedirect() {
  redirect("/admin");
}
