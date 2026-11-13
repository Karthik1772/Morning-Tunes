export type EndBehaviour = "stop" | "repeat" | "next";
export type Schedule = "daily" | "weekdays" | "weekends" | "custom";
export type MusicSource = "playlist" | "songs";
export type Song = { id: string; kind: "youtube"; title: string; videoId: string; url: string };

/** Synced between devices (laptop player + phone remote). */
export type Settings = {
  alarmTime: string; schedule: Schedule; customDays: number[]; enabled: boolean;
  endBehaviour: EndBehaviour; shuffle: boolean; fadeIn: boolean; volume: number; timezone: string;
  musicSource: MusicSource; playlistUrl: string; songs: Song[]; nextPlaylistUrl: string;
  updatedAt: number;
};
/** Stays on each device: which speaker that device is paired with. */
export type DeviceSettings = { speakerName: string; speakerMac: string; speakerVerified: boolean };
export type Heartbeat = { at: number; armed: boolean };

export const DEFAULT_SETTINGS: Settings = {
  alarmTime: "06:00", schedule: "daily", customDays: [1, 2, 3, 4, 5, 6, 0], enabled: false,
  endBehaviour: "stop", shuffle: false, fadeIn: true, volume: 70, timezone: "Asia/Kolkata",
  musicSource: "playlist", playlistUrl: "https://www.youtube.com/playlist?list=PLBo2BExIwYMtr4a-TVwyNvbb1lvbN70jd",
  songs: [], nextPlaylistUrl: "", updatedAt: 0,
};
export const DEFAULT_DEVICE: DeviceSettings = { speakerName: "", speakerMac: "", speakerVerified: false };

export const STORAGE_KEY = "morningtunes.settings.v1";
export const DEVICE_KEY = "morningtunes.device.v1";
export const PASSCODE_KEY = "morningtunes.passcode";
export const LAST_FIRED_KEY = "morningtunes.lastFired";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fb: string, max = 500) => (typeof v === "string" ? v.slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fb: T): T => (opts.includes(v as T) ? (v as T) : fb);

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function normalizeSong(v: unknown): Song | null {
  if (!isObj(v)) return null;
  const id = str(v.id, "", 64);
  if (!id) return null;
  const title = str(v.title, "Song", 200) || "Song";
  const videoId = str(v.videoId, "", 20);
  if (!/^[\w-]{11}$/.test(videoId)) return null; // v1 songs have no `kind`: treated as YouTube
  return { id, kind: "youtube", title, videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

/** Whitelists and validates every field. Used for localStorage, remote data and the API route. */
export function normalizeSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const days = Array.isArray(r.customDays)
    ? [...new Set(r.customDays.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))] : d.customDays;
  const songs = Array.isArray(r.songs)
    ? r.songs.slice(0, 300).map(normalizeSong).filter((x): x is Song => x !== null) : [];
  const vol = typeof r.volume === "number" && Number.isFinite(r.volume) ? Math.round(Math.min(100, Math.max(0, r.volume))) : d.volume;
  const tz = str(r.timezone, d.timezone, 64);
  return {
    alarmTime: typeof r.alarmTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.alarmTime) ? r.alarmTime : d.alarmTime,
    schedule: oneOf(r.schedule, ["daily", "weekdays", "weekends", "custom"] as const, d.schedule),
    customDays: days,
    enabled: bool(r.enabled, d.enabled),
    endBehaviour: oneOf(r.endBehaviour, ["stop", "repeat", "next"] as const, d.endBehaviour),
    shuffle: bool(r.shuffle, d.shuffle),
    fadeIn: bool(r.fadeIn, d.fadeIn),
    volume: vol,
    timezone: isValidTimezone(tz) ? tz : d.timezone,
    musicSource: oneOf(r.musicSource, ["playlist", "songs"] as const, d.musicSource),
    playlistUrl: str(r.playlistUrl, d.playlistUrl),
    songs,
    nextPlaylistUrl: str(r.nextPlaylistUrl, ""),
    updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) && r.updatedAt >= 0 ? r.updatedAt : 0,
  };
}

export function normalizeDevice(raw: unknown): DeviceSettings {
  const r = isObj(raw) ? raw : {};
  return { speakerName: str(r.speakerName, "", 100), speakerMac: str(r.speakerMac, "", 40), speakerVerified: bool(r.speakerVerified, false) };
}
