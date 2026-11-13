"use client";
import { useState } from "react";
import { Bluetooth, Check, CircleHelp, ExternalLink, RefreshCw, Volume2 } from "lucide-react";
import type { DeviceSettings, Settings } from "@/lib/types";
import type { SyncState } from "@/hooks/useSettings";

type Props = {
  settings: Settings; patch: (p: Partial<Settings>) => void;
  device: DeviceSettings; patchDevice: (p: Partial<DeviceSettings>) => void;
  passcode: string; setPasscode: (p: string) => void; sync: SyncState; syncNow: () => Promise<void>;
  reset: () => void; onToggleEnabled: (on: boolean) => void;
};
const SYNC_TEXT: Record<SyncState, string> = {
  local: "Local only: settings stay in this browser. Enter your passcode to sync with your other devices.",
  syncing: "Syncing…", synced: "Synced. Changes on any device reach the others within about 30 seconds.",
  badpass: "Wrong passcode.", unconfigured: "Sync isn't set up on the server yet. See the README (Cross-device sync).",
  error: "Can't reach the server right now. It will retry automatically.",
};

export default function SettingsTab({ settings, patch, device, patchDevice, passcode, setPasscode, sync, syncNow, reset, onToggleEnabled }: Props) {
  const [speakerTested, setSpeakerTested] = useState(false);
  const [speakerMessage, setSpeakerMessage] = useState("Pair the speaker in your device's Bluetooth settings, then press Test speaker.");
  const [passDraft, setPassDraft] = useState(passcode);

  const openBluetoothSettings = () => {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) { setSpeakerMessage("Opening Android Bluetooth settings. Pair and connect your speaker, then return here."); window.location.href = "intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end"; return; }
    if (/Windows/i.test(ua)) { setSpeakerMessage("If Windows settings do not open, use Settings → Bluetooth & devices to pair your speaker."); window.location.href = "ms-settings:bluetooth"; return; }
    setSpeakerMessage("Open your device Settings → Bluetooth, then pair and connect your speaker. Return here when done.");
  };
  const testSpeaker = async () => {
    try {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      if (!C) throw new Error("Audio playback is not supported in this browser.");
      const ctx = new C(); await ctx.resume();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + 0.45); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.72);
      osc.onended = () => { void ctx.close(); };
      setSpeakerTested(true); setSpeakerMessage("Test tone played through this device's current audio output. If you heard it on the right speaker, confirm below.");
    } catch (err) { setSpeakerTested(false); setSpeakerMessage(err instanceof Error ? err.message : "Could not play the test tone. Check browser audio permissions."); }
  };
  const confirmSpeaker = () => { patchDevice({ speakerVerified: true }); setSpeakerMessage("Speaker confirmed by you. This is not an automatic Bluetooth connection check."); };

  return (
    <section className="grid lg:grid-cols-2 gap-5">
      <div className="panel p-6 space-y-5">
        <div><div className="eyebrow mb-1">Alarm configuration</div><h2 className="text-xl font-bold">When should we wake you?</h2></div>
        <div><label className="label">Alarm time</label><input className="field" type="time" value={settings.alarmTime} onChange={(e) => patch({ alarmTime: e.target.value })} /></div>
        <div><label className="label">Repeat schedule</label>
          <select className="field" value={settings.schedule} onChange={(e) => patch({ schedule: e.target.value as Settings["schedule"] })}>
            <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="custom">Custom days</option>
          </select></div>
        {settings.schedule === "custom" && <div><label className="label">Choose days</label><div className="flex flex-wrap gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <button key={d} onClick={() => patch({ customDays: settings.customDays.includes(i) ? settings.customDays.filter((x) => x !== i) : [...settings.customDays, i] })} className={`btn ${settings.customDays.includes(i) ? "btn-primary" : "btn-secondary"}`}>{d}</button>))}
        </div></div>}
        <div><label className="label">Play the alarm on</label>
</div>
        <div className="flex justify-between items-center">
          <div><div className="text-sm font-semibold">Enable alarm</div><div className="text-xs muted">Keep this dashboard open and this device awake</div></div>
          <input aria-label="Enable alarm" className="switch" type="checkbox" checked={settings.enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
        </div>
        <div className="rounded-xl bg-amber-400/10 border border-amber-400/20 p-3 text-xs text-amber-100 flex gap-2"><CircleHelp size={16} className="shrink-0" /> The alarm runs only while this page is open and the device is awake. If the device wakes up late, it still plays within 10 minutes of the alarm time.</div>
      </div>

      <div className="panel p-6 space-y-4">
        <div><div className="eyebrow mb-1">Cross-device sync</div><h2 className="text-xl font-bold">Control it from your phone</h2></div>
        <div><label className="label">Sync passcode</label>
          <div className="flex gap-2">
            <input className="field" type="password" autoComplete="off" value={passDraft} onChange={(e) => setPassDraft(e.target.value)} placeholder="The MORNINGTUNES_PASSCODE you set on the server" />
            <button className="btn btn-primary" onClick={() => setPasscode(passDraft.trim())}>Save</button>
          </div></div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm muted" role="status">{SYNC_TEXT[sync]}</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" disabled={!passcode} onClick={() => void syncNow()}><RefreshCw size={15} /> Sync now</button>
          {passcode && <button className="btn btn-secondary" onClick={() => { setPasscode(""); setPassDraft(""); }}>Turn off sync</button>}
        </div>
        <p className="text-xs muted">Alarm settings and your YouTube library sync across devices. Bluetooth pairing stays managed by each device.</p>
      </div>

      <div className="panel p-6 space-y-5 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div><div className="eyebrow mb-1">Audio output</div><h2 className="text-xl font-bold">Bluetooth speaker</h2>
            <p className="text-sm muted mt-1">Pair through Android or Windows. MorningTunes plays through the device&apos;s selected audio output.</p></div>
          <span className={`text-xs rounded-full px-3 py-1 ${device.speakerVerified ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}><span className="inline-block h-2 w-2 rounded-full mr-2 bg-current" />{device.speakerVerified ? "Confirmed by you" : "Not yet confirmed"}</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div><label className="label">Speaker name</label><input className="field" value={device.speakerName} onChange={(e) => { setSpeakerTested(false); patchDevice({ speakerName: e.target.value, speakerVerified: false }); }} placeholder="e.g. JBL Flip 6" /></div>
          <div><label className="label">Bluetooth MAC address (optional, for your own reference)</label><input className="field" value={device.speakerMac} onChange={(e) => { setSpeakerTested(false); patchDevice({ speakerMac: e.target.value, speakerVerified: false }); }} placeholder="AA:BB:CC:DD:EE:FF" /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={openBluetoothSettings}><Bluetooth size={16} /> Open Bluetooth settings <ExternalLink size={13} /></button>
          <button className="btn btn-secondary" onClick={() => void testSpeaker()}><Volume2 size={16} /> Test speaker</button>
          {speakerTested && <button className="btn btn-secondary" onClick={confirmSpeaker}><Check size={16} /> I heard it on this speaker</button>}
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm muted" role="status">{speakerMessage}</div>
        <p className="text-xs muted">A web page cannot inspect Bluetooth connection status or connect by MAC address. Make sure the speaker is paired and selected as this device audio output.</p>
      </div>

      <div className="panel p-6 space-y-5 lg:col-span-2">
        <div><div className="eyebrow mb-1">Playback preferences</div><h2 className="text-xl font-bold">Make it yours</h2></div>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div><label className="label">After the last song</label>
              <select className="field" value={settings.endBehaviour} onChange={(e) => patch({ endBehaviour: e.target.value as Settings["endBehaviour"] })}>
                <option value="stop">Stop playback</option><option value="repeat">Restart playlist</option><option value="next">Switch to another playlist</option>
              </select></div>
            {settings.endBehaviour === "next" && <div><label className="label">Next playlist URL</label><input className="field" value={settings.nextPlaylistUrl} onChange={(e) => patch({ nextPlaylistUrl: e.target.value })} /></div>}
            <div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Shuffle</div><div className="text-xs muted">Randomize the queue / playlist</div></div><input aria-label="Shuffle" className="switch" type="checkbox" checked={settings.shuffle} onChange={(e) => patch({ shuffle: e.target.checked })} /></div>
            <div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Gradual volume fade-in</div><div className="text-xs muted">Starts quietly when the alarm begins</div></div><input aria-label="Fade in" className="switch" type="checkbox" checked={settings.fadeIn} onChange={(e) => patch({ fadeIn: e.target.checked })} /></div>
          </div>
          <div className="space-y-5">
            <div><div className="flex justify-between mb-2"><label className="label mb-0">Target volume</label><span className="text-sm font-semibold">{settings.volume}%</span></div>
              <input aria-label="Volume" className="w-full accent-amber-400" type="range" min="0" max="100" value={settings.volume} onChange={(e) => patch({ volume: Number(e.target.value) })} /></div>
            <div><label className="label">Timezone</label>
              <select className="field" value={settings.timezone} onChange={(e) => patch({ timezone: e.target.value })}>
                <option value="Asia/Kolkata">India — Asia/Kolkata</option><option value="UTC">UTC</option><option value="America/New_York">New York</option><option value="Europe/London">London</option><option value="Asia/Singapore">Singapore</option>
              </select></div>
            <button className="btn btn-secondary w-full" onClick={reset}>Reset to defaults</button>
          </div>
        </div>
      </div>
    </section>
  );
}
