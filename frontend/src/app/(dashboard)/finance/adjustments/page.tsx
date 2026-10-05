// Client note, 2026-07-22 (#13): "Remove this page please." It was removed in
// revision 1 and came back by URL in revision 17 with no link to it and no
// request behind it. The route forwards to Finance rather than 404ing, so a
// bookmark lands somewhere useful. The API it called is untouched.
import { redirect } from "next/navigation";

export default function RemovedAdjustmentsPage() {
  redirect("/finance");
}
