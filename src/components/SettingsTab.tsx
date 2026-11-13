"use client";
import { useState } from "react";
import { RefreshCw, Volume2 } from "lucide-react";
import type { Settings } from "@/lib/types";
import type { SyncState } from "@/hooks/useSettings";

type Props = {
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  onVolumeChange: (volume: number) => void;
  passcode: string;
  setPasscode: (p: string) => void;
  sync: SyncState;
  syncNow: () => Promise<void>;
  reset: () => void;
  onToggleEnabled: (enabled: boolean) => void;
};

const SYNC_TEXT: Record<SyncState, string> = {
  local: "Local only: settings stay in this browser. Enter your passcode to sync with your other devices.",
  syncing: "Syncing…",
  synced: "Synced. Changes on any device reach the others within about 30 seconds.",
  badpass: "Wrong passcode.",
  unconfigured: "Sync isn't set up on the server yet. See the README (Cross-device sync).",
  error: "Can't reach the server right now. It will retry automatically.",
};

export default function SettingsTab({ settings, patch, onVolumeChange, passcode, setPasscode, sync, syncNow, reset, onToggleEnabled }: Props) {
  const [passDraft, setPassDraft] = useState(passcode);

  const testAudioOutput = async () => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.04);
    gain.gain.setValueAtTime(0.2, context.currentTime + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.62);
    oscillator.onended = () => { void context.close(); };
  };

  return (
    <section className="grid lg:grid-cols-2 gap-5">
      <div className="panel p-6 space-y-5">
        <div><div className="eyebrow mb-1">Alarm configuration</div><h2 className="text-xl font-bold">When should we wake you?</h2></div>
        <div><label className="label">Alarm time</label><input className="field" type="time" value={settings.alarmTime} onChange={(e) => patch({ alarmTime: e.target.value })} /></div>
        <div><label className="label">Repeat schedule</label>
          <select className="field" value={settings.schedule} onChange={(e) => patch({ schedule: e.target.value as Settings["schedule"] })}>
            <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="custom">Custom days</option>
          </select>
        </div>
        {settings.schedule === "custom" && <div><label className="label">Choose days</label><div className="flex flex-wrap gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
            <button key={day} onClick={() => patch({ customDays: settings.customDays.includes(index) ? settings.customDays.filter((value) => value !== index) : [...settings.customDays, index] })} className={`btn ${settings.customDays.includes(index) ? "btn-primary" : "btn-secondary"}`}>{day}</button>
          ))}
        </div></div>}
        <div className="flex justify-between items-center">
          <div><div className="text-sm font-semibold">Enable alarm</div><div className="text-xs muted">Keep this page open and the device awake</div></div>
          <input aria-label="Enable alarm" className="switch" type="checkbox" checked={settings.enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
        </div>
      </div>

      <div className="panel p-6 space-y-4">
        <div><div className="eyebrow mb-1">Cross-device sync</div><h2 className="text-xl font-bold">Control it from your phone</h2></div>
        <div><label className="label">Sync passcode</label><div className="flex gap-2">
          <input className="field" type="password" autoComplete="off" value={passDraft} onChange={(e) => setPassDraft(e.target.value)} placeholder="Your server sync passcode" />
          <button className="btn btn-primary" onClick={() => setPasscode(passDraft.trim())}>Save</button>
        </div></div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm muted" role="status">{SYNC_TEXT[sync]}</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" disabled={!passcode} onClick={() => void syncNow()}><RefreshCw size={15} /> Sync now</button>
          {passcode && <button className="btn btn-secondary" onClick={() => { setPasscode(""); setPassDraft(""); }}>Turn off sync</button>}
        </div>
        <p className="text-xs muted">Alarm settings and your YouTube queue sync across devices. Each device needs its own open, awake browser tab.</p>
      </div>

      <div className="panel p-6 space-y-4 lg:col-span-2">
        <div><div className="eyebrow mb-1">Audio output</div><h2 className="text-xl font-bold">Bluetooth speaker</h2>
          <p className="text-sm muted mt-1">Pair your speaker in your device Bluetooth settings. MorningTunes uses the audio output selected by your operating system.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void testAudioOutput()}><Volume2 size={16} /> Test current audio output</button>
        <p className="text-xs muted">No speaker name or MAC address is needed. A webpage cannot connect to Bluetooth by MAC address or detect the selected speaker.</p>
      </div>

      <div className="panel p-6 space-y-5 lg:col-span-2">
        <div><div className="eyebrow mb-1">Playback preferences</div><h2 className="text-xl font-bold">Make it yours</h2></div>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div><label className="label">After the last song</label><select className="field" value={settings.endBehaviour} onChange={(e) => patch({ endBehaviour: e.target.value as Settings["endBehaviour"] })}>
              <option value="stop">Stop after the last saved song</option><option value="repeat">Repeat saved song queue</option>
            </select></div>
            <div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Shuffle</div><div className="text-xs muted">Randomize the saved song queue</div></div><input aria-label="Shuffle" className="switch" type="checkbox" checked={settings.shuffle} onChange={(e) => patch({ shuffle: e.target.checked })} /></div>
            <div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Gradual volume fade-in</div><div className="text-xs muted">Controls YouTube playback volume, not system volume</div></div><input aria-label="Fade in" className="switch" type="checkbox" checked={settings.fadeIn} onChange={(e) => patch({ fadeIn: e.target.checked })} /></div>
          </div>
          <div className="space-y-5">
            <div><div className="flex justify-between mb-2"><label className="label mb-0">YouTube volume</label><span className="text-sm font-semibold">{settings.volume}%</span></div>
              <input aria-label="Volume" className="w-full accent-amber-400" type="range" min="0" max="100" value={settings.volume} onChange={(e) => { const volume = Number(e.target.value); patch({ volume }); onVolumeChange(volume); }} /></div>
            <div><label className="label">Timezone</label><select className="field" value={settings.timezone} onChange={(e) => patch({ timezone: e.target.value })}>
              <option value="Asia/Kolkata">India — Asia/Kolkata</option><option value="UTC">UTC</option><option value="America/New_York">New York</option><option value="Europe/London">London</option><option value="Asia/Singapore">Singapore</option>
            </select></div>
            <button className="btn btn-secondary w-full" onClick={reset}>Reset to defaults</button>
          </div>
        </div>
      </div>
    </section>
  );
}
