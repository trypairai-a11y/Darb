"use client";
// Darb 2.0 — client-side portal fencing (Slice B, wave 1).
// Mounted once in the (dashboard) layout:
//   - VENDOR users may only browse /vendor/*; anything else bounces to /vendor.
//   - Non-vendor users hitting /vendor/* bounce to "/" — except ADMIN, who may
//     inspect the vendor portal.
// This is UX fencing only; the backend enforces the real containment
// (blockVendorOutsideAllowlist middleware).
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function PortalGuard() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user || !pathname) return;
    const inVendorPortal = pathname === "/vendor" || pathname.startsWith("/vendor/");
    if (user.role === "VENDOR") {
      if (!inVendorPortal) router.replace("/vendor");
    } else if (inVendorPortal && user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [user, pathname, router]);

  return null;
}
