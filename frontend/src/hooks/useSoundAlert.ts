// Darb 2.0 — looping audible alert (SOS console). Web Audio oscillator beeps
// on a 1s cadence; the AudioContext is unlocked on the first user gesture
// (browser autoplay policy); the muted flag persists in localStorage.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "darb:soundAlert:muted";
const BEEP_FREQ = 880;
const BEEP_DURATION = 0.22;
const BEEP_INTERVAL_MS = 1000;

export function useSoundAlert() {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Restore persisted mute preference.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MUTE_KEY) === "1";
      mutedRef.current = stored;
      setMutedState(stored);
    } catch {
      // Storage unavailable — stay unmuted.
    }
  }, []);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  // Autoplay policy: resume the context on the first user gesture.
  useEffect(() => {
    const unlock = () => {
      const ctx = ensureContext();
      if (!ctx) return;
      void ctx.resume().then(() => setUnlocked(true));
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureContext]);

  const beep = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = BEEP_FREQ;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + BEEP_DURATION);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + BEEP_DURATION + 0.02);
  }, [ensureContext]);

  const start = useCallback(() => {
    if (timerRef.current) return;
    setPlaying(true);
    beep();
    timerRef.current = setInterval(beep, BEEP_INTERVAL_MS);
  }, [beep]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
  }, []);

  const setMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMutedState(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return { playing, start, stop, muted, setMuted, unlocked };
}
