"use client";
import { useEffect, useRef, useCallback, useState } from "react";

export interface DarbEvent {
  type: "alert" | "violation" | "notification" | "driver_update" | "score_update" | "connected";
  tenantId?: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

interface UseEventSourceOptions {
  /** Event types to listen for. Omit to receive all. */
  types?: DarbEvent["type"][];
  /** Callback fired on each matching event */
  onEvent?: (event: DarbEvent) => void;
  /** Disable the connection (e.g. when user is logged out) */
  enabled?: boolean;
}

/**
 * Hook that opens an SSE connection to `/api/events` and delivers typed
 * events. Reconnects automatically on disconnect (native EventSource
 * behaviour). Passes the JWT via query parameter since EventSource doesn't
 * support custom headers.
 */
export function useEventSource(options: UseEventSourceOptions = {}) {
  const { types, onEvent, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DarbEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as DarbEvent;
        if (types && types.length > 0 && !types.includes(parsed.type)) return;
        setLastEvent(parsed);
        onEventRef.current?.(parsed);
      } catch {
        // malformed event — skip
      }
    },
    [types]
  );

  useEffect(() => {
    if (!enabled) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    const url = `/api/events?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("connected", (e) => {
      setConnected(true);
      handleEvent(e as MessageEvent);
    });

    const eventTypes: DarbEvent["type"][] = types || [
      "alert",
      "violation",
      "notification",
      "driver_update",
      "score_update",
    ];

    for (const t of eventTypes) {
      es.addEventListener(t, handleEvent as EventListener);
    }

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects — no manual intervention needed
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [enabled, types, handleEvent]);

  return { connected, lastEvent };
}
