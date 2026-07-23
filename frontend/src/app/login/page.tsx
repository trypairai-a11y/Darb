"use client";
import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/**
 * Post-auth landing depends on the authenticated User's role. Staff land on
 * the live ops map, money roles on finance, portal roles inside their fenced
 * portal.
 *
 * SUPER_ADMIN is a separate flag (User.isSuperAdmin), not a UserRole — the
 * standard role-landing applies, with /admin/* surfaces gated by the
 * isSuperAdmin flag.
 */
const ROLE_LANDING: Record<string, string> = {
  // Darb 2.0 — staff land on the live ops map, money roles on finance.
  ADMIN: "/ops",
  OPS_MANAGER: "/ops",
  SUPERVISOR: "/ops",
  ACCOUNTANT: "/finance",
  VIEWER: "/orders",
  // Portal roles land in (and are fenced into) their portals.
  VENDOR: "/vendor",
  FLEET: "/fleet-portal",
};

function landingForRole(role: string | undefined): string {
  if (!role) return "/ops";
  return ROLE_LANDING[role] ?? "/ops";
}

export default function LoginPage() {
  const { login, demoLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");

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

          <div className="max-w-xl animate-fade-up">
            <h1 className="font-display text-display-xl text-white mb-6">
              The operating<br/>system for<br/>delivery fleets.
            </h1>
            <p className="text-white/75 text-lg leading-relaxed max-w-md">
              An AI ops chief for Keeta, Talabat, Deliveroo and Americana fleets — proposals, live floor signals, and finance clarity in one place.
            </p>

            <div className="mt-10 flex items-center gap-6">
              <div>
                <div className="font-display text-4xl">40+</div>
                <div className="text-xs text-white/60 uppercase tracking-wider mt-1">models</div>
              </div>
              <div className="w-px h-10 bg-white/15" />
              <div>
                <div className="font-display text-4xl">4</div>
                <div className="text-xs text-white/60 uppercase tracking-wider mt-1">platforms</div>
              </div>
              <div className="w-px h-10 bg-white/15" />
              <div>
                <div className="font-display text-4xl">24/7</div>
                <div className="text-xs text-white/60 uppercase tracking-wider mt-1">ops</div>
              </div>
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
            <h2 className="font-display text-display-sm text-sand-900 mb-2">Welcome back</h2>
            <p className="text-sm text-sand-700">Sign in to your AI ops chief.</p>
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
                  placeholder="osama@fleet.kw"
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
            By continuing you agree to Darb's <a href="#" className="underline decoration-sand-400 underline-offset-2 hover:text-sand-900">terms</a> and <a href="#" className="underline decoration-sand-400 underline-offset-2 hover:text-sand-900">privacy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
