// Shared between OrderRouteMap (legend, SSR-safe) and OrderRouteMapInner
// (Leaflet, client-only), so the legend and the lines can never disagree.
export const ROUTE_COLORS = {
  pickup: "#1D4E89",
  dropoff: "#B42318",
  toPickup: "#94A3B8",
  toDropoff: "#2F6B4F",
};
