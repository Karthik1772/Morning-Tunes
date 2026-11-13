"use client";
import { useEffect, useRef, useState } from "react";
import { shouldFire } from "@/lib/alarm";
import { LAST_FIRED_KEY, type Settings } from "@/lib/types";

/** Checks the schedule every second and when the page becomes active. */
export function useAlarm(
  settings: Settings,
  settingsLoaded: boolean,
  onAlarm: () => void,
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
    const intervalId = setInterval(checkSchedule, 1000);
    document.addEventListener("visibilitychange", checkSchedule);
    window.addEventListener("focus", checkSchedule);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkSchedule);
      window.removeEventListener("focus", checkSchedule);
    };
  }, [settingsLoaded]);

  return notice;
}
