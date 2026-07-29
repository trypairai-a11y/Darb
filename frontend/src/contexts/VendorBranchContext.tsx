"use client";
// Darb 2.0 PRD build — vendor-portal branch selector state. Holds the branch
// the vendor is currently looking at (null = all branches), persisted to
// localStorage so the choice survives reloads. The branch LIST comes from the
// consumer (vendorApi.me() in the vendor layout); this context only owns the
// selected id.
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

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

  // Only the banner and the hidden write controls need this in React.
  // Scoping the requests is darbApi's job, and it reads the same URL at
  // request time, so there is no ordering to get wrong.
  useEffect(() => {
    setInspect(new URLSearchParams(window.location.search).get("vendorId"));
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
