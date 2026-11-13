"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRemote, pushRemote, sendHeartbeat } from "@/lib/sync";
import {
  DEFAULT_SETTINGS,
  PASSCODE_KEY,
  STORAGE_KEY,
  normalizeSettings,
  type Heartbeat,
  type Settings,
} from "@/lib/types";

export type SyncState =
  | "local"
  | "syncing"
  | "synced"
  | "badpass"
  | "unconfigured"
  | "error";
const POLL_MS = 30000;
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** Local-first settings. With a passcode they also sync through /api/settings (last write wins). */
export function useSettings(armed: boolean) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [passcode, setPasscodeState] = useState("");
  const [sync, setSync] = useState<SyncState>("local");
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const passRef = useRef(passcode);
  passRef.current = passcode;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dead = useRef(false); // server says sync is not configured: stop trying this session

  useEffect(() => {
    const raw = read(STORAGE_KEY);
    try {
      if (raw) setSettings(normalizeSettings(JSON.parse(raw)));
    } catch {}
    setPasscodeState(read(PASSCODE_KEY) ?? "");
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) write(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, ready]);

  const applyRemote = useCallback((s: Settings) => {
    setSettings(s);
  }, []);

  const push = useCallback(async () => {
    const p = passRef.current;
    if (!p || dead.current) return;
    setSync("syncing");
    const r = await pushRemote(p, settingsRef.current);
    if (r.status === "ok") setSync("synced");
    else if (r.status === "conflict") {
      applyRemote(r.settings);
      setSync("synced");
    } else {
      if (r.status === "unconfigured") dead.current = true;
      setSync(r.status);
    }
  }, [applyRemote]);

  const pull = useCallback(async () => {
    const p = passRef.current;
    if (!p || dead.current) return;
    void sendHeartbeat(p, armedRef.current);
    const r = await fetchRemote(p);
    if (r.status !== "ok") {
      if (r.status === "unconfigured") dead.current = true;
      setSync(r.status);
      return;
    }
    setHeartbeat(r.heartbeat);
    const local = settingsRef.current;
    if (r.settings && r.settings.updatedAt > local.updatedAt) {
      applyRemote(r.settings);
      setSync("synced");
    } else if (local.updatedAt > (r.settings?.updatedAt ?? 0)) await push();
    else setSync("synced");
  }, [applyRemote, push]);

  useEffect(() => {
    if (!ready || !passcode) {
      setSync("local");
      return;
    }
    dead.current = false;
    void pull();
    const t = setInterval(() => void pull(), POLL_MS);
    return () => clearInterval(t);
  }, [ready, passcode, armed, pull]);

  const patch = useCallback(
    (p: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...p, updatedAt: Date.now() }));
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void push(), 800);
    },
    [push],
  );
  const setPasscode = useCallback((p: string) => {
    write(PASSCODE_KEY, p);
    setPasscodeState(p);
  }, []);
  const reset = useCallback(() => patch({ ...DEFAULT_SETTINGS }), [patch]);

  return {
    ready,
    settings,
    patch,
    passcode,
    setPasscode,
    sync,
    heartbeat,
    syncNow: pull,
    reset,
  };
}
