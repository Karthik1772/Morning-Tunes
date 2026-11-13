import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSettings, type Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
const KEY_SETTINGS = "morningtunes:settings";
const KEY_HEARTBEAT = "morningtunes:heartbeat";

const cfg = () => ({
  url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  passcode: process.env.MORNINGTUNES_PASSCODE,
});

async function redis(cmd: string[]): Promise<unknown> {
  const { url, token } = cfg();
  const r = await fetch(url!, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmd), cache: "no-store" });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}
const sha = (s: string) => createHash("sha256").update(s).digest();

/** Refuses when sync isn't configured (501) or the passcode is wrong (401). Never open by default. */
function guard(req: NextRequest): NextResponse | null {
  const { url, token, passcode } = cfg();
  if (!url || !token || !passcode) return NextResponse.json({ error: "sync_not_configured" }, { status: 501 });
  if (!timingSafeEqual(sha(req.headers.get("x-passcode") ?? ""), sha(passcode))) return NextResponse.json({ error: "bad_passcode" }, { status: 401 });
  return null;
}
const parse = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : null; } catch { return null; } };

export async function GET(req: NextRequest) {
  const denied = guard(req); if (denied) return denied;
  try {
    const [s, h] = await Promise.all([redis(["GET", KEY_SETTINGS]), redis(["GET", KEY_HEARTBEAT])]);
    return NextResponse.json({ settings: parse(s), heartbeat: parse(h) });
  } catch { return NextResponse.json({ error: "storage_error" }, { status: 502 }); }
}

export async function PUT(req: NextRequest) {
  const denied = guard(req); if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const incoming = normalizeSettings((body as { settings?: unknown })?.settings);
  if (JSON.stringify(incoming).length > 100_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  try {
    const stored = parse(await redis(["GET", KEY_SETTINGS])) as Settings | null;
    if (stored && stored.updatedAt > incoming.updatedAt) return NextResponse.json({ settings: stored }, { status: 409 }); // last write wins
    await redis(["SET", KEY_SETTINGS, JSON.stringify(incoming)]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "storage_error" }, { status: 502 }); }
}

/**
 * Check-ins. Browser tab: `{ armed }`. Windows agent: `{ source: "agent", state, detail }`.
 * They use separate keys so one never overwrites the other.
 */
export async function POST(req: NextRequest) {
  const denied = guard(req); if (denied) return denied;
  let body: { armed?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  try {
    await redis(["SET", KEY_HEARTBEAT, JSON.stringify({ at: Date.now(), armed: body.armed === true }), "EX", "180"]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "storage_error" }, { status: 502 }); }
}
