import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldFire } from "./alarm";
import { normalizeSettings, DEFAULT_SETTINGS } from "./types";

const base = { enabled: true, alarmTime: "06:00", schedule: "daily" as const, customDays: [1, 2, 3, 4, 5, 6, 0], timezone: "Asia/Kolkata" };
// 06:00 IST == 00:30 UTC. 2026-11-14 is a Saturday in IST.
const at = (hhmmUtc: string, date = "2026-11-14") => new Date(`${date}T${hhmmUtc}:00Z`);

test("fires in the alarm minute", () => assert.equal(shouldFire(base, at("00:30"), "").fire, true));
test("fires when the laptop wakes 7 minutes late", () => assert.equal(shouldFire(base, at("00:37"), "").fire, true));
test("does not fire after the grace window", () => assert.equal(shouldFire(base, at("00:41"), "").fire, false));
test("does not fire early", () => assert.equal(shouldFire(base, at("00:29"), "").fire, false));
test("fires only once per day", () => {
  const first = shouldFire(base, at("00:30"), "");
  assert.equal(shouldFire(base, at("00:31"), first.key).fire, false);
  assert.equal(shouldFire(base, at("00:30", "2026-11-15"), first.key).fire, true);
});
test("respects enabled flag", () => assert.equal(shouldFire({ ...base, enabled: false }, at("00:30"), "").fire, false));
test("weekday schedule skips Saturday, weekend schedule fires", () => {
  assert.equal(shouldFire({ ...base, schedule: "weekdays" }, at("00:30"), "").fire, false);
  assert.equal(shouldFire({ ...base, schedule: "weekends" }, at("00:30"), "").fire, true);
});
test("custom days", () => {
  assert.equal(shouldFire({ ...base, schedule: "custom", customDays: [6] }, at("00:30"), "").fire, true);
  assert.equal(shouldFire({ ...base, schedule: "custom", customDays: [1] }, at("00:30"), "").fire, false);
});
test("timezone is honoured", () => assert.equal(shouldFire({ ...base, timezone: "UTC" }, at("00:30"), "").fire, false));
test("bad time or timezone never fires or throws", () => {
  assert.equal(shouldFire({ ...base, alarmTime: "25:99" }, at("00:30"), "").fire, false);
  assert.equal(shouldFire({ ...base, timezone: "Nope/Zone" }, at("00:30"), "").fire, false);
});
test("normalizeSettings migrates v1 songs and drops junk", () => {
  const s = normalizeSettings({ volume: 999, alarmTime: "bad", songs: [{ id: "a", videoId: "dQw4w9WgXcQ", title: "x", url: "u" }, { id: "b", kind: "youtube", videoId: "short" }, { id: "c", kind: "local", title: "mp3" }], evil: 1 });
  assert.equal(s.volume, 100);
  assert.equal(s.alarmTime, DEFAULT_SETTINGS.alarmTime);
  assert.deepEqual(s.songs.map((x) => [x.id, x.kind]), [["a", "youtube"], ["c", "local"]]);
  assert.equal("evil" in s, false);
});
test("playOn defaults to browser, accepts agent, rejects junk", () => {
  assert.equal(normalizeSettings({}).playOn, "browser");
  assert.equal(normalizeSettings({ playOn: "agent" }).playOn, "agent");
  assert.equal(normalizeSettings({ playOn: "rm -rf" }).playOn, "browser");
  assert.equal(DEFAULT_SETTINGS.playOn, "browser");
});
