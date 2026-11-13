"use client";
import { useEffect, useRef, useState } from "react";
import { shouldFire } from "@/lib/alarm";
import { LAST_FIRED_KEY, type Settings } from "@/lib/types";

const WORKER_SRC = `
  let id = null;
  onmessage = (e) => {
    if (e.data === "start" && id === null) id = setInterval(() => postMessage("tick"), 1000);
    if (e.data === "stop" && id !== null) { clearInterval(id); id = null; }
  };
`;

/**
 * Checks the schedule every second, even when the tab is in the background.
 *
 * Background tabs get their main-thread timers throttled (to once a minute after ~5 min in
 * Chrome) and can be frozen. To keep the alarm on time we:
 *  - tick from a Web Worker, whose timers are not throttled like the page's,
 *  - hold a Web Lock while armed, which stops Chrome from freezing the tab,
 *  - keep the tab audible with an inaudible tone, which exempts it from throttling,
 *  - re-check on every wake-up signal (visible, focus, resume, pageshow, online).
 * A closed browser, discarded tab, or sleeping device still cannot ring.
 */
export function useAlarm(
  settings: Settings,
  settingsLoaded: boolean,
  onAlarm: () => void,
  armed = true,
) {
  const latestSettings = useRef(settings);
  const alarmCallback = useRef(onAlarm);
  const [notice, setNotice] = useState("");

  latestSettings.current = settings;
  alarmCallback.current = onAlarm;

  useEffect(() => {
    if (!settingsLoaded) return;

    const checkSchedule = () => {
      const currentSettings = latestSettings.current;
      let lastTriggeredKey = "";
      try {
        lastTriggeredKey = localStorage.getItem(LAST_FIRED_KEY) ?? "";
      } catch {}

      const decision = shouldFire(
        currentSettings,
        new Date(),
        lastTriggeredKey,
      );
      if (!decision.fire) return;

      try {
        localStorage.setItem(LAST_FIRED_KEY, decision.key);
      } catch {}
      setNotice(
        `Alarm triggered at ${new Date().toLocaleTimeString("en-IN", { timeZone: currentSettings.timezone })} (${currentSettings.timezone})`,
      );
      alarmCallback.current();
    };

    checkSchedule();

    // Worker ticker, with a plain interval as a fallback and as a second safety net.
    let worker: Worker | null = null;
    let workerUrl = "";
    try {
      workerUrl = URL.createObjectURL(
        new Blob([WORKER_SRC], { type: "text/javascript" }),
      );
      worker = new Worker(workerUrl);
      worker.onmessage = checkSchedule;
      worker.postMessage("start");
    } catch {
      worker = null;
    }
    const intervalId = setInterval(checkSchedule, worker ? 5000 : 1000);

    const wakeEvents: [EventTarget, string][] = [
      [document, "visibilitychange"],
      [document, "resume"],
      [window, "focus"],
      [window, "pageshow"],
      [window, "online"],
    ];
    wakeEvents.forEach(([t, n]) => t.addEventListener(n, checkSchedule));

    return () => {
      clearInterval(intervalId);
      if (worker) {
        worker.postMessage("stop");
        worker.terminate();
      }
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      wakeEvents.forEach(([t, n]) => t.removeEventListener(n, checkSchedule));
    };
  }, [settingsLoaded]);

  // Hold a Web Lock while the alarm is on and this tab is armed so the tab is not frozen.
  useEffect(() => {
    if (!settingsLoaded || !settings.enabled || !armed) return;
    const locks = (navigator as any).locks;
    if (!locks?.request) return;
    let release: (() => void) | undefined;
    let cancelled = false;
    locks
      .request(
        "morningtunes-keep-alive",
        () =>
          new Promise<void>((resolve) => {
            if (cancelled) resolve();
            else release = resolve;
          }),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
      release?.();
    };
  }, [settingsLoaded, settings.enabled, armed]);

  // Keep the tab "audible". Chrome throttles, freezes and discards hidden tabs, and that also
  // slows the embedded YouTube player, so the song can stall until you come back to the tab.
  // A tab that is playing audio is exempt. This tone is about -56 dBFS: far below what you can
  // hear, but above Chrome's silence threshold, so the tab counts as playing audio.
  useEffect(() => {
    if (!settingsLoaded || !settings.enabled || !armed) return;
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return;
    let ctx: AudioContext;
    try {
      ctx = new C();
    } catch {
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 50;
    gain.gain.value = 0.0015;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const resume = () => {
      if (ctx.state !== "running") void ctx.resume().catch(() => {});
    };
    resume();
    ctx.addEventListener("statechange", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pointerdown", resume);
    return () => {
      ctx.removeEventListener("statechange", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pointerdown", resume);
      try {
        osc.stop();
      } catch {}
      void ctx.close().catch(() => {});
    };
  }, [settingsLoaded, settings.enabled, armed]);

  return notice;
}