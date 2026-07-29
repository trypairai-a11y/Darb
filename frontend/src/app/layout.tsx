import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/shared/Toast";
import { I18nProvider } from "@/i18n/I18nProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { DEFAULT_LOCALE, LOCALES, Locale, isRtl } from "@/i18n/messages";

// "Darb - Fleet Management" and "AI-powered delivery fleet operating system"
// both predate the 2026-07 pivot, from when this managed other people's fleets.
// Darb runs the delivery now: shops send the order, Darb owns the dispatch,
// the driver, the delivery and the money.
export const metadata: Metadata = {
  title: "Darb",
  description: "Zone-based delivery for Kuwait.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const cookieStore = cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined;
    if (cookieLocale && LOCALES.includes(cookieLocale)) {
      locale = cookieLocale;
    }
  } catch {
    // cookies() may fail on edge; fall back to default
  }
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body className="antialiased">
        <QueryProvider>
          <I18nProvider locale={locale}>
            <AuthProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
