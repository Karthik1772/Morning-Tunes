"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bluetooth, ListMusic, Music2, Pause, Play, Settings2, ShieldCheck, Sun } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { usePlayback } from "@/hooks/usePlayback";
import { useAlarm } from "@/hooks/useAlarm";
import LibraryTab from "./LibraryTab";
import SettingsTab from "./SettingsTab";

const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

export default function MorningTunes() {
  const [armed, setArmed] = useState(false); // this tab has had a click, so the browser allows sound
  const { ready, settings, patch, device, patchDevice, passcode, setPasscode, sync, heartbeat, syncNow, reset } = useSettings(armed);
  const [tab, setTab] = useState<"library" | "settings">("library");
  const [now, setNow] = useState(new Date());
  const playerHost = useRef<HTMLDivElement>(null); // always mounted, so switching tabs never destroys the player
  const pb = usePlayback(settings, playerHost);
  const alarmNotice = useAlarm(settings, ready, () => pb.start(true));
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const arm = async () => { await pb.unlock(); setArmed(true); };
  const toggleEnabled = (on: boolean) => { patch({ enabled: on }); if (on) void arm(); };
  const test = async () => { await arm(); pb.start(false); };

  if (!ready) return <main className="shell"><p className="muted">Loading MorningTunes…</p></main>;
  const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: settings.timezone }).format(now);
  const playerSeen = heartbeat && now.getTime() - heartbeat.at < 120000;

  return (
    <main className="shell">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-9">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="MorningTunes" className="h-12 w-auto" />
        </div>
        <div className="text-xs muted flex items-center gap-2" title={pb.loadError || (pb.ready ? "YouTube player initialized" : "Waiting for YouTube")}><span className={`h-2 w-2 rounded-full ${pb.ready ? "bg-emerald-400" : pb.loadError ? "bg-rose-400" : "bg-amber-400"}`} />{pb.ready ? "Player ready" : pb.loadError ? "Player error" : "Connecting player"} · {time}</div>
      </header>

      {settings.enabled && !armed && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 flex flex-wrap items-center justify-between gap-3" role="alert">
          <div className="flex items-center gap-3 text-sm text-amber-100"><AlertTriangle size={18} className="shrink-0" /> The alarm is on, but this tab hasn&apos;t been armed. Browsers block sound until you click once on the page.</div>
          <button className="btn btn-primary" onClick={() => void arm()}><ShieldCheck size={16} /> Arm this device</button>
        </div>
      )}

      <section className="grid lg:grid-cols-[1.35fr_.85fr] gap-5 mb-6">
        <div className="rounded-3xl p-8 relative overflow-hidden" style={{ background: "linear-gradient(120deg,#25364a,#172438 65%,#382c24)" }}>
          <div className="absolute -right-8 -top-12 opacity-10"><Sun size={220} /></div>
          <div className="relative">
            <div className="eyebrow mb-3">Your morning, on your terms</div>
            <div className="text-5xl md:text-6xl font-extrabold mb-2" style={{ fontFamily: "Manrope" }}>{time}</div>
            <p className="text-sm text-slate-300 mb-7">{settings.timezone}</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={() => void test()}><Play size={16} /> Test playback</button>
              <button className="btn btn-secondary" onClick={pb.stop}><Pause size={16} /> Stop</button>
            </div>
          </div>
        </div>
        <div className="panel p-6 flex flex-col justify-between">
          <div>
            <div className="eyebrow mb-2">Next alarm</div>
            <div className="text-4xl font-bold" style={{ fontFamily: "Manrope" }}>{settings.alarmTime}</div>
            <div className="text-sm muted mt-1 capitalize">{settings.schedule}</div>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div><div className="text-sm font-semibold">Alarm enabled</div>
                <div className="text-xs muted">{!settings.enabled ? "Turn on to schedule playback" : armed ? "This browser is armed" : "Not armed yet"}</div></div>
              <input aria-label="Enable alarm" className="switch" type="checkbox" checked={settings.enabled} onChange={(e) => toggleEnabled(e.target.checked)} />
            </div>
            {passcode && !armed && (
              <div className={`text-xs ${playerSeen && heartbeat?.armed ? "text-emerald-300" : "text-amber-200"}`}>
                {heartbeat ? (playerSeen && heartbeat.armed ? `Player online and armed · seen ${ago(now.getTime() - heartbeat.at)}` : `Player last seen ${ago(now.getTime() - heartbeat.at)}. It may be asleep or closed`) : "No player has checked in yet"}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[1fr_330px] gap-5 mb-6">
        <div className="panel p-6">
          <div className="flex items-center justify-between mb-5">
            <div><div className="eyebrow mb-1">Now playing</div><h2 className="text-xl font-bold">{pb.playingTitle}</h2>
              <p className={`text-xs mt-1 ${pb.loadError ? "text-rose-300" : "muted"}`} role="status" aria-live="polite">{pb.status}</p></div>
            <Music2 className={pb.fallback ? "text-rose-300" : "text-amber-300"} />
          </div>
          <div className="youtube-player-host"><div ref={playerHost} className="w-full" /></div>
          {alarmNotice && <p className="text-xs muted mt-3">{alarmNotice}</p>}
          <div className="text-xs muted mt-4 flex items-center gap-2"><Bluetooth size={14} /> Pair your speaker in your device Bluetooth settings</div>
        </div>
        <div className="panel p-6">
          <div className="eyebrow mb-4">Alarm snapshot</div>
          <div className="space-y-4 text-sm">
            <div><span className="muted">Saved songs</span><div className="font-semibold">{settings.songs.length} individual video{settings.songs.length === 1 ? "" : "s"} in queue</div></div>
            <div><span className="muted">After last song</span><div className="font-semibold capitalize">{settings.endBehaviour}</div></div>
            <div><span className="muted">Shuffle</span><div className="font-semibold">{settings.shuffle ? "On" : "Off"}</div></div>
            <div><span className="muted">Volume</span><div className="font-semibold">{settings.volume}% · Fade {settings.fadeIn ? "on" : "off"}</div></div>
          </div>
        </div>
      </section>

      <nav className="flex gap-2 mb-5">
        {(["library", "settings"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-primary" : "btn-secondary"} capitalize`}>{t === "library" ? <ListMusic size={15} /> : <Settings2 size={15} />} {t}</button>
        ))}
      </nav>
      {tab === "library" && <LibraryTab settings={settings} patch={patch} />}
      {tab === "settings" && <SettingsTab settings={settings} patch={patch} device={device} patchDevice={patchDevice} passcode={passcode} setPasscode={setPasscode} sync={sync} syncNow={syncNow} reset={reset} onToggleEnabled={toggleEnabled} />}

      <div className="mt-7 text-xs muted flex flex-wrap justify-between gap-3">
        <span>MorningTunes · Settings save automatically in this browser{passcode ? " and sync across your devices" : ""}</span>
        <span className="flex items-center gap-2"><Bluetooth size={13} /> Pair your Bluetooth speaker in device settings</span>
      </div>
    </main>
  );
}
