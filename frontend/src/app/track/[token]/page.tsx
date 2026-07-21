// Darb 2.0 PRD §12 — public customer tracking page. Outside (dashboard):
// no auth, no sidebar; the token in the URL is the only credential. The root
// layout already provides QueryProvider + I18nProvider + cookie locale +
// dir on <html>, so RTL comes free.
import TrackView from "@/components/track/TrackView";

export const metadata = { title: "Track your order | Darb" };

export default function TrackPage({ params }: { params: { token: string } }) {
  return <TrackView token={params.token} />;
}
