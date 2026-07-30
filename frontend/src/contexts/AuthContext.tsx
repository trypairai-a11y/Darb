"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import api, { setAccessToken } from "@/lib/api";
import { usePathname } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  // Phase 2 Wave 5 — /api/auth/me now surfaces isSuperAdmin so the
  // frontend SidebarV2 + /admin routes can conditionally render. Optional
  // on the type (older sessions / mock users may not include it).
  isSuperAdmin?: boolean;
  tenant?: { id: string; name: string };
  // Darb 2.0 — VENDOR-role users carry their vendor binding so the frontend
  // can fence them into /vendor/* and scope portal calls. Optional: staff
  // users and older sessions won't include them.
  vendorId?: string;
  vendor?: { id: string; name: string };
  // Darb 2.0 — FLEET-role users carry their fleet-partner binding so the
  // frontend can fence them into /fleet-portal/* and scope portal calls.
  fleetPartnerId?: string;
  // Darb 2.0 — which portal role a VENDOR user holds (OWNER | FINANCE |
  // ORDER_TRACKING) and, for a branch-scoped tracker, the one branch they may
  // see. Both come from the signed token; the header and the rail read them so
  // a shop's accountant is not shown the same portal as its owner.
  vendorRole?: "OWNER" | "FINANCE" | "ORDER_TRACKING" | null;
  branchId?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Returns the freshly-authenticated user so callers (notably the login
  // page) can route by role without waiting for the next render. Phase 2
  // Wave 3 — login page reads `result.role` to decide between /decisions,
  // /v2/triage, /v2/money.
  login: (email: string, password: string) => Promise<User>;
  demoLogin: () => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error("AuthContext not initialised");
  },
  demoLogin: async () => {
    throw new Error("AuthContext not initialised");
  },
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const publicRoutes = ["/", "/login"];
    // /track/* is the public customer tracking surface (PRD §12) and /pay/* the
    // public wallet top-up link (revision 10, #2): no session, no refresh call,
    // no redirect. A merchant opening a payment link on a phone with no cookie
    // must land on the payment page, not on a staff sign-in form.
    if (
      publicRoutes.includes(pathname) ||
      pathname.startsWith("/track") ||
      pathname.startsWith("/pay")
    ) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [pathname]);

  async function checkAuth() {
    try {
      const { data } = await api.post("/api/auth/refresh");
      setAccessToken(data.accessToken);
      const { data: me } = await api.get("/api/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<User> {
    const { data } = await api.post("/api/auth/login", { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user as User;
  }

  async function demoLogin(): Promise<User> {
    const { data } = await api.post("/api/auth/demo");
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user as User;
  }

  async function logout() {
    await api.post("/api/auth/logout");
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
