import { normalizeSettings, type Heartbeat, type Settings } from "./types";

export type Fail = { status: "unconfigured" | "badpass" | "error" };
export type RemoteResult =
  | { status: "ok"; settings: Settings | null; heartbeat: Heartbeat | null }
  | Fail;
export type PushResult =
  | { status: "ok" }
  | { status: "conflict"; settings: Settings }
  | Fail;

const headers = (p: string) => ({
  "content-type": "application/json",
  "x-passcode": p,
});
function failOf(code: number): Fail {
  return {
    status: code === 501 ? "unconfigured" : code === 401 ? "badpass" : "error",
  };
}

export async function fetchRemote(passcode: string): Promise<RemoteResult> {
  try {
    const r = await fetch("/api/settings", {
      headers: headers(passcode),
      cache: "no-store",
    });
    if (!r.ok) return failOf(r.status);
    const j = await r.json();
    return {
      status: "ok",
      settings: j.settings ? normalizeSettings(j.settings) : null,
      heartbeat: j.heartbeat ?? null,
    };
  } catch {
    return { status: "error" };
  }
}
export async function pushRemote(
  passcode: string,
  settings: Settings,
): Promise<PushResult> {
  try {
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: headers(passcode),
      body: JSON.stringify({ settings }),
    });
    if (r.status === 409) {
      const j = await r.json();
      return { status: "conflict", settings: normalizeSettings(j.settings) };
    }
    return r.ok ? { status: "ok" } : failOf(r.status);
  } catch {
    return { status: "error" };
  }
}
export async function sendHeartbeat(
  passcode: string,
  armed: boolean,
): Promise<void> {
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: headers(passcode),
      body: JSON.stringify({ armed }),
    });
  } catch {}
}
