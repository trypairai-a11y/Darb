// Darb 2.0 — dependency-free click-to-add-vertex polygon editor built on
// react-leaflet primitives (react-leaflet-draw is RL5-incompatible).
//   click map        → append vertex
//   drag handle      → move vertex (manual drag: map dragging paused)
//   midpoint handle  → insert vertex on an edge (starts dragging it)
//   dblclick / right-click a handle → remove vertex
//   click first handle (≥3 vertices) or "Close polygon" → emit GeoJSON ring
//   Escape / Cancel  → onCancel
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleMarker, Polygon, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useI18n } from "@/i18n/I18nProvider";

type LatLngPair = [number, number];

interface ZonePolygonEditorProps {
  /** Existing ring to edit as [lat, lng] pairs (unclosed). */
  initialRing?: LatLngPair[] | null;
  color?: string;
  /** Receives a closed GeoJSON ring: [lng, lat] pairs, first === last. */
  onComplete: (ring: number[][]) => void;
  onCancel: () => void;
}

export default function ZonePolygonEditor({
  initialRing,
  color = "#1D4E89",
  onComplete,
  onCancel,
}: ZonePolygonEditorProps) {
  const [vertices, setVertices] = useState<LatLngPair[]>(initialRing ?? []);
  const draggingRef = useRef<number | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);

  const verticesRef = useRef(vertices);
  verticesRef.current = vertices;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const map = useMapEvents({
    click(e) {
      if (draggingRef.current != null) return;
      // Ignore clicks that originate on vector shapes (handles, preview).
      const target = e.originalEvent.target as HTMLElement | null;
      if (target && (target.tagName === "path" || target.closest?.("path"))) return;
      setVertices((v) => [...v, [e.latlng.lat, e.latlng.lng]]);
    },
    mousemove(e) {
      const i = draggingRef.current;
      if (i == null) return;
      setVertices((v) =>
        v.map((p, idx) => (idx === i ? ([e.latlng.lat, e.latlng.lng] as LatLngPair) : p))
      );
    },
    mouseup() {
      endDrag();
    },
  });

  const endDrag = useCallback(() => {
    if (draggingRef.current == null) return;
    draggingRef.current = null;
    map.dragging.enable();
  }, [map]);

  const startDrag = useCallback(
    (index: number) => {
      draggingRef.current = index;
      map.dragging.disable();
    },
    [map]
  );

  const complete = useCallback(() => {
    const v = verticesRef.current;
    if (v.length < 3) return;
    const ring = v.map(([lat, lng]) => [lng, lat]);
    ring.push([...ring[0]]);
    onCompleteRef.current(ring);
  }, []);

  // Double-click zoom conflicts with dblclick-to-remove; pause it while editing.
  useEffect(() => {
    map.doubleClickZoom.disable();
    const container = map.getContainer();
    const prevCursor = container.style.cursor;
    container.style.cursor = "crosshair";
    return () => {
      map.doubleClickZoom.enable();
      map.dragging.enable();
      container.style.cursor = prevCursor;
    };
  }, [map]);

  // Escape cancels the whole edit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Keep clicks on the floating control from reaching the map.
  useEffect(() => {
    const el = controlRef.current;
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  }, [vertices.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeVertex = (index: number) => {
    setVertices((v) => v.filter((_, idx) => idx !== index));
  };

  const insertMidpoint = (edgeIndex: number) => {
    setVertices((v) => {
      const a = v[edgeIndex];
      const b = v[(edgeIndex + 1) % v.length];
      const mid: LatLngPair = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const next = [...v];
      next.splice(edgeIndex + 1, 0, mid);
      return next;
    });
    // The freshly-inserted vertex starts dragging immediately.
    draggingRef.current = edgeIndex + 1;
    map.dragging.disable();
  };

  const closed = vertices.length >= 3;
  const midpoints: { edge: number; point: LatLngPair }[] = [];
  if (vertices.length >= 2) {
    const edgeCount = closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < edgeCount; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      midpoints.push({ edge: i, point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
    }
  }

  return (
    <>
      {closed ? (
        <Polygon
          positions={vertices}
          pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.12, interactive: false }}
        />
      ) : (
        vertices.length >= 2 && (
          <Polyline
            positions={vertices}
            pathOptions={{ color, weight: 2, dashArray: "5 5", interactive: false }}
          />
        )
      )}

      {/* Midpoint insert handles */}
      {midpoints.map(({ edge, point }) => (
        <CircleMarker
          key={`m-${edge}-${point[0].toFixed(6)}-${point[1].toFixed(6)}`}
          center={point}
          radius={4}
          pathOptions={{ color, weight: 1.5, fillColor: "#ffffff", fillOpacity: 0.9, opacity: 0.7 }}
          eventHandlers={{
            mousedown: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              insertMidpoint(edge);
            },
          }}
        />
      ))}

      {/* Vertex handles */}
      {vertices.map((p, i) => (
        <CircleMarker
          key={`v-${i}`}
          center={p}
          radius={6}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: i === 0 ? "#111827" : color,
            fillOpacity: 1,
          }}
          eventHandlers={{
            mousedown: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              startDrag(i);
            },
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              // Clicking the first vertex closes the polygon.
              if (i === 0 && verticesRef.current.length >= 3) complete();
            },
            dblclick: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              removeVertex(i);
            },
            contextmenu: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              e.originalEvent.preventDefault();
              removeVertex(i);
            },
          }}
        />
      ))}

      {/* Floating action bar (plain HTML rendered inside the map container). */}
      <EditorControls
        controlRef={controlRef}
        vertexCount={vertices.length}
        onUndo={() => setVertices((v) => v.slice(0, -1))}
        onComplete={complete}
        onCancel={onCancel}
      />
    </>
  );
}

function EditorControls({
  controlRef,
  vertexCount,
  onUndo,
  onComplete,
  onCancel,
}: {
  controlRef: React.RefObject<HTMLDivElement>;
  vertexCount: number;
  onUndo: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      ref={controlRef}
      dir="ltr"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 rounded-pill bg-white/95 border border-sand-300 shadow-float px-3 py-2"
    >
      <span className="text-xs text-sand-700 whitespace-nowrap">
        {vertexCount === 0 ? t("zonesPage.drawHint") : `${vertexCount} ${t("zonesPage.vertices")}`}
      </span>
      <button
        type="button"
        onClick={onUndo}
        disabled={vertexCount === 0}
        className="px-2.5 py-1 text-xs font-medium rounded-pill bg-sand-100 text-sand-800 hover:bg-sand-200 disabled:opacity-40 transition-colors"
      >
        {t("zonesPage.undoVertex")}
      </button>
      <button
        type="button"
        onClick={onComplete}
        disabled={vertexCount < 3}
        className="px-2.5 py-1 text-xs font-medium rounded-pill bg-primary text-white hover:bg-primary-hover disabled:opacity-40 transition-colors"
      >
        {t("zonesPage.closePolygon")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-2.5 py-1 text-xs font-medium rounded-pill text-red-600 hover:bg-red-50 transition-colors"
      >
        {t("common.cancel")}
      </button>
    </div>
  );
}
