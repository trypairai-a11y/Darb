"use client";
// Darb 2.0 PRD build — vendor-portal branch selector state. Holds the branch
// the vendor is currently looking at (null = all branches), persisted to
// localStorage so the choice survives reloads. The branch LIST comes from the
// consumer (vendorApi.me() in the vendor layout); this context only owns the
// selected id.
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setInspectVendorId } from "@/lib/darbApi";

const STORAGE_KEY = "darb.vendor.branch";

interface VendorBranchContextValue {
  /** Selected branch id, or null for "all branches". */
  branchId: string | null;
  setBranchId: (id: string | null) => void;
  /**
   * Set when an ADMIN is reading someone else's portal via ?vendorId=. The
   * server only answers GETs in that mode (middleware/vendorScope), so screens
   * use this to hide the controls that would 403: new order, pause, cancel,
   * refund. A vendor's own session is always null here.
   */
  inspectVendorId: string | null;
}

const VendorBranchContext = createContext<VendorBranchContextValue>({
  branchId: null,
  setBranchId: () => {},
  inspectVendorId: null,
});

export function VendorBranchProvider({ children }: { children: ReactNode }) {
  const [branchId, setBranchIdState] = useState<string | null>(null);
  const [inspectVendorId, setInspect] = useState<string | null>(null);

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setBranchIdState(stored);
    } catch {
      // Private mode / storage disabled: fall back to in-memory state only.
    }
  }, []);

  // darbApi has to know the id DURING this render, not after it. Children mount
  // and fire their queries before a parent's effects run, so setting this in a
  // useEffect meant the first /api/vendor/* calls went out unscoped, came back
  // 403, and left the portal showing an empty board and no vendor name. Writing
  // it here is safe because it is idempotent: every render computes the same id
  // from the same URL.
  if (typeof window !== "undefined") {
    setInspectVendorId(new URLSearchParams(window.location.search).get("vendorId"));
  }

  // The React-visible copy stays in an effect so the server (no URL) and the
  // client's first paint agree, and hydration does not mismatch on the banner.
  // Cleared on unmount so leaving the portal cannot leak the scope into a
  // later request.
  useEffect(() => {
    setInspect(new URLSearchParams(window.location.search).get("vendorId"));
    return () => setInspectVendorId(null);
  }, []);

  function setBranchId(id: string | null) {
    setBranchIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures; the in-memory value still applies.
    }
  }

  return (
    <VendorBranchContext.Provider value={{ branchId, setBranchId, inspectVendorId }}>
      {children}
    </VendorBranchContext.Provider>
  );
}

export const useVendorBranch = () => useContext(VendorBranchContext);
