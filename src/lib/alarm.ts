import type { Settings } from "./types";

/** If the page wakes up late (laptop sleep, throttled tab), still fire within this many minutes. */
export const GRACE_MINUTES = 10;
const DAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    day: DAYS[get("weekday")] as number | undefined,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

type AlarmSettings = Pick<
  Settings,
  "enabled" | "alarmTime" | "schedule" | "customDays" | "timezone"
>;

export function isDayAllowed(
  s: Pick<Settings, "schedule" | "customDays">,
  day: number,
): boolean {
  if (s.schedule === "daily") return true;
  if (s.schedule === "weekdays") return day >= 1 && day <= 5;
  if (s.schedule === "weekends") return day === 0 || day === 6;
  return s.customDays.includes(day);
}

/** Pure decision: should the alarm fire right now? `key` is the date to remember once it has fired. */
export function shouldFire(
  s: AlarmSettings,
  now: Date,
  lastFiredKey: string,
  graceMinutes = GRACE_MINUTES,
) {
  const no = { fire: false, key: lastFiredKey };
  if (!s.enabled) return no;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.alarmTime);
  if (!m) return no;
  let p: ReturnType<typeof zonedParts>;
  try {
    p = zonedParts(now, s.timezone);
  } catch {
    return no;
  }
  if (p.day === undefined || !isDayAllowed(s, p.day)) return no;
  const late = p.minutes - (Number(m[1]) * 60 + Number(m[2]));
  if (late < 0 || late > graceMinutes) return no;
  if (`${p.dateKey}@${s.alarmTime}` === lastFiredKey) return no;
  // Include the configured time so a changed alarm can fire later on the same day.
  return { fire: true, key: `${p.dateKey}@${s.alarmTime}` };
}
