/**
 * DemandHeatMap.tsx — "where the work is", on the driver's Home tab.
 *
 * Client request, 2026-08-04: Home carries the status toggle and a heat map and
 * nothing else. This is that map.
 *
 * It draws Darb's real zone polygons in SVG rather than pins on a tile map, and
 * that is a deliberate choice rather than a shortcut:
 *
 *   - The driver app has no map library at all. Navigation deep-links out to
 *     Google, Waze or Apple Maps, so nothing here has ever rendered a tile.
 *   - react-native-maps is native-only. The app also ships a web build at
 *     darb-driver.vercel.app, which is what the client demos from, and it would
 *     render blank there. It also forces a custom dev client, so drivers could
 *     no longer be handed an Expo Go link.
 *   - react-native-svg is already a dependency and renders identically on iOS,
 *     Android and web.
 *
 * The question a driver opens this for is "which side of town should I sit on",
 * and shaded areas answer that. Street detail does not.
 *
 * Shading is relative to the busiest zone in the same response, not to an
 * absolute order count: an absolute scale paints the whole map cold on a slow
 * Tuesday and tells the driver nothing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import * as Location from "expo-location";
import { fetchDemand, type DriverZoneDemand } from "../api/client";
import { getLanguage, t as tr } from "../i18n/strings";
import { useTheme, type Palette, space, radius, continuous } from "../theme";

const MAP_HEIGHT = 224;

/** Degrees of padding around the drawn extent so no edge sits on the border. */
const PAD_RATIO = 0.04;

type Pt = { x: number; y: number };

/**
 * Equirectangular projection. A degree of longitude is shorter than a degree of
 * latitude by cos(latitude), so without this factor Kuwait's zones render about
 * 13% too wide and the shapes stop matching the ones on the ops map.
 */
function project(lng: number, lat: number, latRef: number): Pt {
  return { x: lng * Math.cos((latRef * Math.PI) / 180), y: -lat };
}

/** Outer ring of a GeoJSON Polygon, tolerating the odd malformed row. */
function outerRing(zone: DriverZoneDemand): number[][] | null {
  const coords = zone.polygon?.coordinates;
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return null;
  const ring = coords[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  return ring.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function DemandHeatMap() {
  const { c, t } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const arabic = getLanguage() === "ar";

  const [zones, setZones] = useState<DriverZoneDemand[]>([]);
  const [windowMinutes, setWindowMinutes] = useState(90);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchDemand();
      setZones(res.data);
      setWindowMinutes(res.windowMinutes);
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Last known rather than a fresh fix: the dot is a nice-to-have and a GPS
  // acquisition on a cold screen would hold the map blank for seconds.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (alive && last) setHere({ lat: last.coords.latitude, lng: last.coords.longitude });
      } catch {
        /* no dot, the map still works */
      }
    })();
    return () => { alive = false; };
  }, []);

  const geometry = useMemo(() => {
    const rings: { zone: DriverZoneDemand; ring: number[][] }[] = [];
    for (const z of zones) {
      const ring = outerRing(z);
      if (ring && ring.length >= 3) rings.push({ zone: z, ring });
    }
    if (rings.length === 0) return null;

    const lats = rings.flatMap((r) => r.ring.map((p) => p[1]));
    const latRef = (Math.min(...lats) + Math.max(...lats)) / 2;

    const paths = rings.map(({ zone, ring }) => {
      const pts = ring.map((p) => project(p[0], p[1], latRef));
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(5)} ${p.y.toFixed(5)}`).join(" ") + " Z";
      return { zone, d, pts };
    });

    const all = paths.flatMap((p) => p.pts);
    let minX = Math.min(...all.map((p) => p.x));
    let maxX = Math.max(...all.map((p) => p.x));
    let minY = Math.min(...all.map((p) => p.y));
    let maxY = Math.max(...all.map((p) => p.y));
    const padX = Math.max((maxX - minX) * PAD_RATIO, 0.002);
    const padY = Math.max((maxY - minY) * PAD_RATIO, 0.002);
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;

    const w = maxX - minX;
    const h = maxY - minY;
    return {
      paths,
      latRef,
      viewBox: `${minX} ${minY} ${w} ${h}`,
      // Stroke and dot radius live in viewBox units (degrees), so they have to
      // be derived from the extent or they render either invisible or as a
      // blanket over the whole map.
      stroke: Math.max(w, h) / 320,
      dot: Math.max(w, h) / 55,
    };
  }, [zones]);

  // Default the caption to the busiest zone: opening the screen should already
  // answer the question without a tap.
  const busiest = useMemo(
    () => zones.reduce<DriverZoneDemand | null>((best, z) => (!best || z.recentOrders > best.recentOrders ? z : best), null),
    [zones],
  );
  const selected = useMemo(
    () => zones.find((z) => z.id === selectedId) ?? busiest,
    [zones, selectedId, busiest],
  );

  const totalOrders = zones.reduce((sum, z) => sum + z.recentOrders, 0);

  return (
    <View style={styles.card} testID="home-demand-heatmap">
      <View style={styles.headerRow}>
        <Text style={[t.headline, { flex: 1 }]}>{tr("home.demand_title")}</Text>
        <Text style={[t.caption1, { color: c.secondaryLabel }]}>
          {tr("home.demand_window", { mins: String(windowMinutes) })}
        </Text>
      </View>

      {status === "loading" ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={c.tint} />
        </View>
      ) : status === "error" || !geometry ? (
        <View style={styles.placeholder}>
          <Text style={[t.footnote, { color: c.tertiaryLabel, textAlign: "center" }]}>
            {tr("home.demand_unavailable")}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.mapWrap}>
            <Svg width="100%" height={MAP_HEIGHT} viewBox={geometry.viewBox} preserveAspectRatio="xMidYMid meet">
              {geometry.paths.map(({ zone, d }) => {
                const quiet = zone.recentOrders === 0;
                const isSelected = selected?.id === zone.id;
                return (
                  <Path
                    key={zone.id}
                    d={d}
                    fill={quiet ? c.gray4 : c.tint}
                    fillOpacity={quiet ? 0.35 : 0.18 + zone.intensity * 0.7}
                    stroke={isSelected ? c.label : c.hairline}
                    strokeWidth={geometry.stroke * (isSelected ? 2.4 : 1)}
                    onPress={() => setSelectedId(zone.id)}
                  />
                );
              })}
              {here ? (
                (() => {
                  const p = project(here.lng, here.lat, geometry.latRef);
                  return (
                    <>
                      <Circle cx={p.x} cy={p.y} r={geometry.dot} fill={c.tint} fillOpacity={0.25} />
                      <Circle cx={p.x} cy={p.y} r={geometry.dot / 2.4} fill={c.label} />
                    </>
                  );
                })()
              ) : null}
            </Svg>
          </View>

          {/* Caption: the numbers behind whichever area is selected. */}
          {selected ? (
            <TouchableOpacity
              style={styles.caption}
              activeOpacity={1}
              accessibilityRole="text"
              testID="home-demand-caption"
            >
              <View style={{ flex: 1 }}>
                <Text style={[t.subheadline, { color: c.label }]} numberOfLines={1}>
                  {arabic && selected.nameAr ? selected.nameAr : selected.name}
                </Text>
                <Text style={[t.footnote, { color: c.secondaryLabel, marginTop: 1 }]}>
                  {tr("home.demand_orders", { count: String(selected.recentOrders) })}
                  {selected.waitingOrders > 0
                    ? ` · ${tr("home.demand_waiting", { count: String(selected.waitingOrders) })}`
                    : ""}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.legend}>
            <Text style={[t.caption2, { color: c.tertiaryLabel }]}>{tr("home.demand_quiet")}</Text>
            <View style={styles.legendBar}>
              {[0.12, 0.3, 0.48, 0.66, 0.88].map((o) => (
                <View key={o} style={[styles.legendStep, { backgroundColor: c.tint, opacity: o }]} />
              ))}
            </View>
            <Text style={[t.caption2, { color: c.tertiaryLabel }]}>{tr("home.demand_busy")}</Text>
          </View>

          <Text style={[t.caption2, { color: c.tertiaryLabel, marginTop: space.sm }]}>
            {totalOrders === 0 ? tr("home.demand_empty") : tr("home.demand_tap_hint")}
          </Text>
        </>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    marginTop: space.md, backgroundColor: c.groupedSecondary, borderRadius: radius.card,
    padding: space.base, borderWidth: 1, borderColor: c.hairline, ...continuous,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  placeholder: { height: MAP_HEIGHT, alignItems: "center", justifyContent: "center" },
  mapWrap: {
    height: MAP_HEIGHT, borderRadius: radius.field, overflow: "hidden",
    backgroundColor: c.groupedBackground, ...continuous,
  },
  caption: {
    flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md,
    backgroundColor: c.tertiaryFill, borderRadius: radius.field, paddingVertical: 10,
    paddingHorizontal: space.md, ...continuous,
  },
  legend: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  legendBar: { flex: 1, flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" },
  legendStep: { flex: 1, height: 8 },
});

export default DemandHeatMap;
