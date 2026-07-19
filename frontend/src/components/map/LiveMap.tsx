// Darb 2.0 — SSR-safe Leaflet map entry point.
// React Leaflet is SSR-unfriendly, so (following the MiniMapView pattern)
// LiveMapInner is lazy-loaded with next/dynamic { ssr: false }. This wrapper
// is the ONLY module pages should import — everything Leaflet lives behind
// the dynamic boundary. The container is forced LTR (Leaflet's own controls
// assume it) and isolated so map panes never bleed over app chrome.
"use client";
import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";
import type { LiveMapProps } from "./LiveMapInner";

export const KUWAIT_CENTER: [number, number] = [29.3759, 47.9774];

const LiveMapInner = dynamic(() => import("./LiveMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sand-100 text-xs text-secondary">
      Loading map…
    </div>
  ),
});

export type { LiveMapProps, OrderMarker, SingleMarker, EditorConfig } from "./LiveMapInner";

export default function LiveMap({
  height = "100%",
  className,
  ...props
}: LiveMapProps & { height?: string; className?: string }) {
  return (
    <div
      dir="ltr"
      className={cn("relative z-0 isolate w-full overflow-hidden", className)}
      style={{ height }}
    >
      <LiveMapInner {...props} />
    </div>
  );
}
