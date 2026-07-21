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
}

const VendorBranchContext = createContext<VendorBranchContextValue>({
  branchId: null,
  setBranchId: () => {},
});

export function VendorBranchProvider({ children }: { children: ReactNode }) {
  const [branchId, setBranchIdState] = useState<string | null>(null);

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setBranchIdState(stored);
    } catch {
      // Private mode / storage disabled: fall back to in-memory state only.
    }
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
    <VendorBranchContext.Provider value={{ branchId, setBranchId }}>
      {children}
    </VendorBranchContext.Provider>
  );
}

export const useVendorBranch = () => useContext(VendorBranchContext);
