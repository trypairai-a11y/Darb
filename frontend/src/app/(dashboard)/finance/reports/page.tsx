// Merged into the Money screen (revision #31). Kept as a redirect that
// forwards the old ?view= and ?type= deep links onto the matching tab. The
// old "remittances" view has no tab of its own any more: it was a read-only
// copy of the Cash handed in desk, so it lands there.
import { redirect } from "next/navigation";

const TAB_FOR_VIEW: Record<string, string> = {
  ledger: "ledger",
  "vendor-statements": "vendor-statements",
  reconciliation: "reconciliation",
  remittances: "cash",
};

export default function ReportsRedirect({
  searchParams,
}: {
  searchParams: { view?: string; type?: string };
}) {
  const params = new URLSearchParams({
    tab: TAB_FOR_VIEW[searchParams.view ?? ""] ?? "ledger",
  });
  if (searchParams.type) params.set("type", searchParams.type);
  redirect(`/finance?${params.toString()}`);
}
