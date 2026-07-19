// Darb 2.0 — typed SSE hook over the existing /api/events stream (plan §A7).
// Follows the useSSE pattern (token query param, exponential backoff) and
// adds: per-event addEventListener for every named Darb event, and a
// refresh-before-reconnect step so a stream killed by access-token expiry
// comes back with a fresh token.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import api, { getAccessToken, setAccessToken } from "@/lib/api";
import { DARB_EVENT_NAMES, type DarbLiveEvent, type DarbEventName } from "@/types/darb";

interface UseDarbEventsOptions {
  enabled?: boolean;
  /** Called for every received Darb event (already parsed + typed). */
  onEvent?: (event: DarbLiveEvent) => void;
}

const EVENTS_URL = "/api/events";
const MAX_BACKOFF_MS = 30_000;

export function useDarbEvents({ enabled = true, onEvent }: UseDarbEventsOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DarbLiveEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!enabled || closedRef.current) return;

    const token = getAccessToken();
    const url = token ? `${EVENTS_URL}?token=${encodeURIComponent(token)}` : EVENTS_URL;
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    const deliver = (name: DarbEventName, raw: string) => {
      try {
        const payload = JSON.parse(raw);
        const event = { type: name, payload } as DarbLiveEvent;
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        // Malformed payload — ignore.
      }
    };

    source.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };

    // Named events per §A7.
    for (const name of DARB_EVENT_NAMES) {
      source.addEventListener(name, (e) => deliver(name, (e as MessageEvent).data));
    }

    // Fallback: default messages that carry { type, payload } in the body.
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (
          data &&
          typeof data.type === "string" &&
          (DARB_EVENT_NAMES as readonly string[]).includes(data.type)
        ) {
          deliver(data.type as DarbEventName, JSON.stringify(data.payload ?? data));
        }
      } catch {
        // Heartbeats / non-JSON — ignore.
      }
    };

    source.onerror = () => {
      setConnected(false);
      source.close();
      if (closedRef.current) return;
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), MAX_BACKOFF_MS);
      retryRef.current++;
      setTimeout(async () => {
        if (closedRef.current) return;
        // Refresh before reconnecting — the most common disconnect cause is
        // the 15-minute access token expiring under the stream.
        try {
          const { data } = await api.post("/api/auth/refresh");
          if (data?.accessToken) setAccessToken(data.accessToken);
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 401) {
            // Session is gone — the api interceptor handles redirecting.
            return;
          }
        }
        connect();
      }, delay);
    };
  }, [enabled]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [connect]);

  return { connected, lastEvent };
}
