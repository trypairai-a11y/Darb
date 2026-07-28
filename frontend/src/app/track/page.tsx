// Darb 2.0 — /track with no token.
//
// darb-track.vercel.app is the customer handle. Before this, its root fell
// through to the staff app's "/" route, which redirects anyone not signed in
// to /login — so a customer who tapped the bare domain, or whose tracking link
// got truncated in WhatsApp, landed on a fleet-management sign-in form asking
// for a password they will never have.
//
// The token is the credential (PRD §12). Without one there is nothing to show
// and nothing to ask for, so this says exactly that and stops. Deliberately a
// server component with no auth context and no API call: nothing here should
// be able to redirect a customer into the staff app.
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track your order | Darb",
  description: "Your Darb tracking link arrives by WhatsApp.",
};

export default function TrackIndexPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-5">
        <Image
          src="/logo.png"
          alt="Darb"
          width={140}
          height={48}
          className="object-contain h-10 w-auto mx-auto"
          priority
        />
        <h1 className="font-display text-xl text-sand-900">Track your order</h1>
        <p className="text-sm text-sand-600 leading-relaxed">
          Your tracking link arrives by WhatsApp when the shop sends your order out. Open that
          link to see where your driver is.
        </p>
        <p className="text-sm text-sand-600 leading-relaxed">
          If you cannot find it, the shop you ordered from can send it again.
        </p>
      </div>
    </main>
  );
}
