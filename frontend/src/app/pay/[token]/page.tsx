// Revision 10 (#2) — public wallet top-up page. Outside (dashboard): no auth,
// no sidebar; the token in the URL is the only credential. The root layout
// already provides QueryProvider + I18nProvider + cookie locale + dir on
// <html>, so RTL comes free.
//
// Deliberately not named /payment or /checkout: those segments are on the same
// ad-blocker lists that killed /vendor/analytics in production. /pay is not.
import PayView from "@/components/vendor/PayView";

export const metadata = { title: "Top up your wallet | Darb" };

export default function PayPage({ params }: { params: { token: string } }) {
  return <PayView token={params.token} />;
}
