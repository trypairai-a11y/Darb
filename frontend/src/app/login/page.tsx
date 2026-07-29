"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

import { landingForRole } from "@/lib/roleLanding";

// Each persona handle lands its audience on a surface (middleware.ts), but the
// login form sat in front of all of them saying the same thing, so a merchant
// tapping darb-merchant met a sign-in screen indistinguishable from the staff
// one and had no way to tell they were in the right place. Naming the portal
// costs one line and changes no behaviour: where you go after signing in is
// still decided by your role, not by the door you came through.
//
// darb-hq is absent on purpose. It is the staff handle and its audience is
// everyone, so there is no one portal to name.
interface Portal {
  /** Badge above the form. */
  name: string;
  /** The headline on the brand panel, one line per array entry. */
  headline: string[];
  blurb: string;
  /** Three figures that mean something to this audience. */
  facts: { value: string; label: string }[];
  placeholder: string;
  /** What to do if you have no account yet. */
  help: string;
}

/**
 * Each handle gets its own first screen.
 *
 * The handles already land their audiences on the right surface, but the login
 * form in front of them said the same thing to everyone, so a shop owner and a
 * dispatcher met an identical page and had no way to tell they were in the
 * right place. Same brand throughout: navy ground, sand type, the yellow dot.
 * What changes is what the page is about, which is the part that was missing.
 *
 * darb-hq is absent on purpose. It is the staff handle and its audience is
 * everyone, so it keeps the platform-level pitch below.
 */
const PORTAL_BY_HOST: Record<string, Portal> = {
  "darb-merchant.vercel.app": {
    name: "Merchant portal",
    headline: ["Your orders,", "from counter", "to door."],
    blurb:
      "Send us the order. We find the driver, make the delivery and settle the money, and you watch it happen.",
    facts: [
      { value: "Live", label: "order board" },
      { value: "Daily", label: "settlement" },
      { value: "One", label: "delivery partner" },
    ],
    placeholder: "you@yourshop.com",
    help: "No login yet? Ask Darb to set one up for your shop.",
  },
  "darb-fleet.vercel.app": {
    name: "Fleet portal",
    headline: ["Your drivers,", "your numbers,", "your payouts."],
    blurb:
      "Every driver on your roster, how they are performing, and what you are owed for the period.",
    facts: [
      { value: "Roster", label: "and documents" },
      { value: "Scorecard", label: "by period" },
      { value: "Monthly", label: "payouts" },
    ],
    placeholder: "you@yourcompany.com",
    help: "No login yet? Ask Darb operations to create one.",
  },
};

export default function LoginPage() {
  const { login, demoLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  // Read after mount: the server has no hostname, and filling this in during
  // render would be a hydration mismatch on every handle.
  const [portal, setPortal] = useState<Portal | null>(null);
  useEffect(() => {
    setPortal(PORTAL_BY_HOST[window.location.hostname] ?? null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      router.push(landingForRole(result?.role));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-sand-100">
      {/* Left brand panel — deep navy */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-navy-800 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-700 opacity-95" />
        <div className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full bg-navy-600/30 blur-3xl" />
        <div className="absolute bottom-0 -left-10 w-[420px] h-[420px] rounded-full bg-moss/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/15">
              <span className="font-display text-xl">D</span>
            </div>
            <span className="text-sm tracking-widest uppercase text-white/70">Darb</span>
          </div>

          {/* This panel used to read "An AI ops chief for Keeta, Talabat,
              Deliveroo and Americana fleets", with a "4 platforms" stat
              counting them. That was the pre-rebuild positioning, and it put
              four competitors' names on the first screen anyone sees. Darb is
              the only platform in scope now (PRD §1), so the copy says what
              Darb does rather than whose fleets it manages. */}
          <div className="max-w-xl animate-fade-up">
            {portal && (
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#F5C518] mb-5">
                {portal.name}
              </p>
            )}
            <h1 className="font-display text-display-xl text-white mb-6">
              {portal ? (
                portal.headline.map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < portal.headline.length - 1 && <br />}
                  </span>
                ))
              ) : (
                <>The operating<br/>system for<br/>delivery in Kuwait.</>
              )}
            </h1>
            <p className="text-white/75 text-lg leading-relaxed max-w-md">
              {portal
                ? portal.blurb
                : "Shops send the order. Darb owns the dispatch, the driver, the delivery and the money, and shows every one of them in one place."}
            </p>

            <div className="mt-10 flex items-center gap-6">
              {(portal?.facts ?? [
                { value: "Kuwait", label: "zones" },
                { value: "One", label: "partner" },
                { value: "24/7", label: "ops" },
              ]).map((f, i) => (
                <div key={f.label} className="flex items-center gap-6">
                  {i > 0 && <div className="w-px h-10 bg-white/15" />}
                  <div>
                    <div className="font-display text-4xl">{f.value}</div>
                    <div className="text-xs text-white/60 uppercase tracking-wider mt-1">
                      {f.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-white/50">
            <span>© {new Date().getFullYear()} Darb</span>
            <span className="font-mono">Kuwait · v2.0</span>
          </div>
        </div>
      </div>

      {/* Right auth panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex justify-center mb-8">
            <Image src="/logo.png" alt="Darb" width={140} height={48} className="object-contain h-12 w-auto" priority />
          </div>

          <div className="mb-8">
            {portal && (
              <span className="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-pill bg-navy-600/10 text-navy-700 text-[11px] font-medium uppercase tracking-[0.14em]">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#F5C518]" />
                {portal.name}
              </span>
            )}
            <h2 className="font-display text-display-sm text-sand-900 mb-2">Welcome back</h2>
            <p className="text-sm text-sand-700">Sign in to Darb.</p>
          </div>

          <div className="inline-flex p-1 rounded-pill bg-sand-200 mb-6">
            <button
              onClick={() => setMode("email")}
              className={`px-4 py-1.5 text-xs font-medium rounded-pill transition-all duration-250 ease-sierra-out ${
                mode === "email" ? "bg-white text-sand-900 shadow-soft" : "text-sand-700 hover:text-sand-900"
              }`}
            >
              Email
            </button>
            <button
              onClick={() => setMode("phone")}
              className={`px-4 py-1.5 text-xs font-medium rounded-pill transition-all duration-250 ease-sierra-out ${
                mode === "phone" ? "bg-white text-sand-900 shadow-soft" : "text-sand-700 hover:text-sand-900"
              }`}
            >
              Phone
            </button>
          </div>

          {mode === "email" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-2 tracking-wide uppercase">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 h-11 rounded-xl bg-white border border-sand-300 text-sm placeholder:text-sand-500 focus:outline-none focus:ring-[3px] focus:ring-primary-ring focus:border-primary transition-all duration-250"
                  placeholder={portal?.placeholder ?? "you@darb.com"}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-2 tracking-wide uppercase">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 h-11 rounded-xl bg-white border border-sand-300 text-sm placeholder:text-sand-500 focus:outline-none focus:ring-[3px] focus:ring-primary-ring focus:border-primary transition-all duration-250"
                  placeholder="Enter password"
                  required
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-2 tracking-wide uppercase">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 h-11 rounded-xl bg-white border border-sand-300 text-sm placeholder:text-sand-500 focus:outline-none focus:ring-[3px] focus:ring-primary-ring focus:border-primary transition-all duration-250"
                  placeholder="+965 XXXX XXXX"
                />
              </div>
              <button className="btn-primary w-full h-11">Send OTP</button>
            </div>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-sand-300" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-sand-100 px-3 text-sand-600 uppercase tracking-widest">or</span>
            </div>
          </div>

          <button
            onClick={async () => {
              setError("");
              setLoading(true);
              try {
                const result = await demoLogin();
                router.push(landingForRole(result?.role));
              } catch (err: any) {
                setError(err?.response?.data?.error || err?.message || "Demo login failed");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="btn-secondary w-full h-11 disabled:opacity-50"
          >
            Enter demo workspace
          </button>

          <p className="text-[11px] text-sand-600 mt-6 text-center">
            {portal && <span className="block mb-2 text-sand-700">{portal.help}</span>}
            By continuing you agree to Darb's <a href="#" className="underline decoration-sand-400 underline-offset-2 hover:text-sand-900">terms</a> and <a href="#" className="underline decoration-sand-400 underline-offset-2 hover:text-sand-900">privacy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
