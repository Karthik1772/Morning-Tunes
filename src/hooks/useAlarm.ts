"use client";
import { useEffect, useRef, useState } from "react";
import { shouldFire } from "@/lib/alarm";
import { LAST_FIRED_KEY, type Settings } from "@/lib/types";

/** Checks the schedule every second and on wake/focus; fires at most once per day, with a late-start grace window. */
export function useAlarm(settings: Settings, ready: boolean, onFire: () => void) {
  const sRef = useRef(settings); sRef.current = settings;
  const fire = useRef(onFire); fire.current = onFire;
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!ready) return;
    const check = () => {
      const s = sRef.current;
      let last = ""; try { last = localStorage.getItem(LAST_FIRED_KEY) ?? ""; } catch {}
      const r = shouldFire(s, new Date(), last);
      if (!r.fire) return;
      try { localStorage.setItem(LAST_FIRED_KEY, r.key); } catch {}
      setNotice(`Alarm triggered at ${new Date().toLocaleTimeString("en-IN", { timeZone: s.timezone })} (${s.timezone})`);
      fire.current();
    };
    check();
    const t = setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [ready]);
  return notice;
}
