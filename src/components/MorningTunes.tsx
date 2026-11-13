"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, AudioLines, Bluetooth, Check, ChevronDown, ChevronUp, CircleHelp, ExternalLink, ListMusic, Music2, Pause, Play, Plus, Radio, Settings2, Sun, Trash2, Volume2, Youtube } from "lucide-react";
import { DEFAULT_SETTINGS, STORAGE_KEY, type Settings, type Song } from "@/lib/types";
import { getPlaylistId, getVideoId, youtubeUrl } from "@/lib/youtube";

const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

export default function MorningTunes() {
  const [armed, setArmed] = useState(false); // this tab has had a click, so the browser allows sound
  const { ready, settings, patch, device, patchDevice, passcode, setPasscode, sync, heartbeat, syncNow, reset } = useSettings(armed);
  const [tab, setTab] = useState<"library" | "settings">("library");
  const [now, setNow] = useState(new Date());
  const [localIds, setLocalIds] = useState<Set<string>>(new Set());
  const playerHost = useRef<HTMLDivElement>(null); // always mounted, so switching tabs never destroys the player
  const pb = usePlayback(settings, playerHost);
  const alarmNotice = useAlarm(settings, ready, () => pb.start(true));

  const refreshLocal = useCallback(async () => { try { setLocalIds(new Set(await listFileIds())); } catch {} }, []);
  useEffect(() => { void refreshLocal(); }, [refreshLocal]);
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
          <div className="h-11 w-11 rounded-2xl bg-amber-400/15 text-amber-300 flex items-center justify-center"><AudioLines size={23} /></div>
          <div><div className="font-bold text-xl" style={{ fontFamily: "Manrope" }}>MorningTunes</div><div className="text-xs muted">A better way to wake up</div></div>
        </div>
        <div className="text-xs muted flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${pb.ready ? "bg-emerald-400" : "bg-amber-400"}`} />{pb.ready ? "Player ready" : "Connecting player"} · {time}</div>
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
              <p className="text-xs muted mt-1" role="status">{pb.status}</p></div>
            <Music2 className={pb.fallback ? "text-rose-300" : "text-amber-300"} />
          </div>
          <div className="rounded-xl overflow-hidden bg-black/30 min-h-[180px] flex items-center justify-center"><div ref={playerHost} /></div>
          {alarmNotice && <p className="text-xs muted mt-3">{alarmNotice}</p>}
          <div className="text-xs muted mt-4 flex items-center gap-2"><Bluetooth size={14} /> Pair your speaker in your device Bluetooth settings</div>
        </div>
        <div className="panel p-6">
          <div className="eyebrow mb-4">Alarm snapshot</div>
          <div className="space-y-4 text-sm">
            <div><span className="muted">Music source</span><div className="font-semibold">{settings.musicSource === "playlist" ? "YouTube playlist" : `Song queue (${settings.songs.length})`}</div></div>
            <div><span className="muted">After last song</span><div className="font-semibold capitalize">{settings.endBehaviour}</div></div>
            <div><span className="muted">Shuffle</span><div className="font-semibold">{settings.shuffle ? "On" : "Off"}</div></div>
            <div><span className="muted">Volume</span><div className="font-semibold">{settings.volume}% · Fade {settings.fadeIn ? "on" : "off"}</div></div>
          </div>
        </div>
      </section>

  const patch=(p:Partial<Settings>)=>setSettings(s=>({...s,...p}));
  const addSong=()=>{const id=getVideoId(url);if(!id){setStatus("Enter a valid YouTube video URL");return;}const song:Song={id:crypto.randomUUID(),videoId:id,title:title.trim()||`Song ${settings.songs.length+1}`,url:youtubeUrl(id)};patch({songs:[...settings.songs,song]});setUrl("");setTitle("");};
  const moveSong=(i:number,d:number)=>{const a=[...settings.songs],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];patch({songs:a});};
  const openBluetoothSettings=()=>{const ua=navigator.userAgent;if(/Android/i.test(ua)){setSpeakerMessage("Opening Android Bluetooth settings. Pair and connect your speaker, then return here.");window.location.href="intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end";return;}if(/Windows/i.test(ua)){setSpeakerMessage("If Windows settings do not open, use Settings → Bluetooth & devices to pair your speaker.");window.location.href="ms-settings:bluetooth";return;}setSpeakerMessage("Open your device Settings → Bluetooth, then pair and connect your speaker. Return here when done.");};
  const testSpeaker=async()=>{try{const AudioContextClass=window.AudioContext||(window as any).webkitAudioContext;if(!AudioContextClass)throw new Error("Audio playback is not supported in this browser.");const ctx=new AudioContextClass();await ctx.resume();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type="sine";osc.frequency.value=660;gain.gain.setValueAtTime(0.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.25,ctx.currentTime+0.04);gain.gain.setValueAtTime(0.25,ctx.currentTime+0.45);gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.7);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.72);osc.onended=()=>{void ctx.close();};setSpeakerTested(true);setSpeakerMessage("Test tone played through your device's current audio output. If you heard it on the designated speaker, confirm below.");}catch(err){setSpeakerTested(false);setSpeakerMessage(err instanceof Error?err.message:"Could not play the test tone. Check browser audio permissions.");}};
  const confirmSpeaker=()=>{patch({speakerVerified:true});setSpeakerMessage("Speaker confirmed by you. This is not an automatic Bluetooth connection check.");};
  const time=new Intl.DateTimeFormat("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:settings.timezone}).format(now);
  if(!ready)return <main className="shell"><p className="muted">Loading MorningTunes…</p></main>;

  return <main className="shell">
    <header className="flex flex-wrap items-center justify-between gap-4 mb-9"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-amber-400/15 text-amber-300 flex items-center justify-center"><AudioLines size={23}/></div><div><div className="font-bold text-xl" style={{fontFamily:"Manrope"}}>MorningTunes</div><div className="text-xs muted">A better way to wake up</div></div></div><div className="text-xs muted flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400"/>{playerReady?"Player ready":"Connecting player"} · {time}</div></header>
    <section className="grid lg:grid-cols-[1.35fr_.85fr] gap-5 mb-6"><div className="rounded-3xl p-8 relative overflow-hidden" style={{background:"linear-gradient(120deg,#25364a,#172438 65%,#382c24)"}}><div className="absolute -right-8 -top-12 opacity-10"><Sun size={220}/></div><div className="relative"><div className="eyebrow mb-3">Your morning, on your terms</div><div className="text-5xl md:text-6xl font-extrabold mb-2" style={{fontFamily:"Manrope"}}>{time}</div><p className="text-sm text-slate-300 mb-7">{settings.timezone}</p><div className="flex flex-wrap gap-3"><button className="btn btn-primary" onClick={play} disabled={!playerReady}><Play size={16}/> Test playback</button><button className="btn btn-secondary" onClick={stop}><Pause size={16}/> Stop</button></div></div></div><div className="panel p-6 flex flex-col justify-between"><div><div className="eyebrow mb-2">Next alarm</div><div className="text-4xl font-bold" style={{fontFamily:"Manrope"}}>{settings.alarmTime}</div><div className="text-sm muted mt-1 capitalize">{settings.schedule}</div></div><div className="mt-6 pt-5 border-t border-slate-700 flex items-center justify-between"><div><div className="text-sm font-semibold">Alarm enabled</div><div className="text-xs muted">{settings.enabled?"This browser is armed":"Turn on to schedule playback"}</div></div><input aria-label="Enable alarm" className="switch" type="checkbox" checked={settings.enabled} onChange={e=>patch({enabled:e.target.checked})}/></div></div></section>
    <nav className="flex gap-2 mb-5">{(["overview","library","settings"] as const).map(t=><button key={t} onClick={()=>setTab(t)} className={`btn ${tab===t?"btn-primary":"btn-secondary"} capitalize`}>{t==="overview"?<Radio size={15}/>:t==="library"?<ListMusic size={15}/>:<Settings2 size={15}/>} {t}</button>)}</nav>
    {tab==="overview"&&<section className="grid lg:grid-cols-[1fr_330px] gap-5"><div className="panel p-6"><div className="flex items-center justify-between mb-5"><div><div className="eyebrow mb-1">Now playing</div><h2 className="text-xl font-bold">{playingTitle}</h2><p className="text-xs muted mt-1">{status}</p></div><Music2 className="text-amber-300"/></div><div className="rounded-xl overflow-hidden bg-black/30 min-h-[180px] flex items-center justify-center"><div ref={playerHost}/></div><div className="text-xs muted mt-4 flex items-center gap-2"><Bluetooth size={14}/> Pair your speaker in your device Bluetooth settings</div></div><div className="panel p-6"><div className="eyebrow mb-4">Alarm snapshot</div><div className="space-y-4 text-sm"><div><span className="muted">Music source</span><div className="font-semibold">{settings.musicSource==="playlist"?"YouTube playlist":"Individual songs"}</div></div><div><span className="muted">After last song</span><div className="font-semibold">{settings.endBehaviour}</div></div><div><span className="muted">Shuffle</span><div className="font-semibold">{settings.shuffle?"On":"Off"}</div></div><div><span className="muted">Volume</span><div className="font-semibold">{settings.volume}% · Fade {settings.fadeIn?"on":"off"}</div></div><button className="btn btn-secondary w-full" onClick={()=>setTab("settings")}>Manage settings <ChevronDown size={14}/></button></div></div></section>}
    {tab==="library"&&<section className="panel p-6"><div className="eyebrow mb-1">Your music</div><h2 className="text-xl font-bold mb-5">Music library</h2><label className="label">Playback source</label><div className="flex gap-2 mb-5"><button className={`btn ${settings.musicSource==="playlist"?"btn-primary":"btn-secondary"}`} onClick={()=>patch({musicSource:"playlist"})}><ListMusic size={15}/> YouTube playlist</button><button className={`btn ${settings.musicSource==="songs"?"btn-primary":"btn-secondary"}`} onClick={()=>patch({musicSource:"songs"})}><Youtube size={15}/> Individual songs</button></div><div className="grid md:grid-cols-2 gap-4 mb-6"><div><label className="label">YouTube playlist URL</label><input className="field" value={settings.playlistUrl} onChange={e=>patch({playlistUrl:e.target.value})}/></div><div className="flex items-end"><a className="btn btn-secondary w-full" href={settings.playlistUrl} target="_blank" rel="noreferrer"><Youtube size={16}/> Open playlist</a></div></div><div className="border-t border-slate-700 pt-5"><h3 className="font-semibold mb-3">Add individual songs</h3><div className="grid md:grid-cols-[1fr_1.4fr_auto] gap-2"><input className="field" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Song title (optional)"/><input className="field" value={url} onChange={e=>setUrl(e.target.value)} placeholder="Paste YouTube video URL"/><button className="btn btn-primary" onClick={addSong}><Plus size={15}/> Add song</button></div></div><div className="mt-6 space-y-2">{settings.songs.length===0?<p className="muted text-sm py-6 text-center">No individual songs yet.</p>:settings.songs.map((s,i)=><div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800"><Youtube size={17} className="text-red-400"/><div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{s.title}</div><a className="text-xs muted" href={s.url} target="_blank" rel="noreferrer">Open video</a></div><span className="text-xs muted">#{i+1}</span><button aria-label="Move up" onClick={()=>moveSong(i,-1)}><ChevronUp size={17}/></button><button aria-label="Move down" onClick={()=>moveSong(i,1)}><ChevronDown size={17}/></button><button aria-label="Remove song" onClick={()=>patch({songs:settings.songs.filter(x=>x.id!==s.id)})}><Trash2 size={16} className="text-rose-300"/></button></div>)}</div><p className="text-xs muted mt-5">Select the source above to choose which collection the alarm plays.</p></section>}
    {tab==="settings"&&<section className="grid lg:grid-cols-2 gap-5"><div className="panel p-6 space-y-5"><div><div className="eyebrow mb-1">Alarm configuration</div><h2 className="text-xl font-bold">When should we wake you?</h2></div><div><label className="label">Alarm time</label><input className="field" type="time" value={settings.alarmTime} onChange={e=>patch({alarmTime:e.target.value})}/></div><div><label className="label">Repeat schedule</label><select className="field" value={settings.schedule} onChange={e=>patch({schedule:e.target.value as Settings["schedule"]})}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="custom">Custom days</option></select></div>{settings.schedule==="custom"&&<div><label className="label">Choose days</label><div className="flex flex-wrap gap-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=><button key={d} onClick={()=>patch({customDays:settings.customDays.includes(i)?settings.customDays.filter(x=>x!==i):[...settings.customDays,i]})} className={`btn ${settings.customDays.includes(i)?"btn-primary":"btn-secondary"}`}>{d}</button>)}</div></div>}<div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Enable alarm</div><div className="text-xs muted">Keep this dashboard open</div></div><input className="switch" type="checkbox" checked={settings.enabled} onChange={e=>patch({enabled:e.target.checked})}/></div><div className="rounded-xl bg-amber-400/10 border border-amber-400/20 p-3 text-xs text-amber-100 flex gap-2"><CircleHelp size={16}/> Browser alarms run only while this page is open and device is awake.</div></div><div className="panel p-6 space-y-5 lg:col-span-2"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow mb-1">Audio output</div><h2 className="text-xl font-bold">Bluetooth speaker</h2><p className="text-sm muted mt-1">Pair through Android or Windows. MorningTunes plays through the device's selected audio output.</p></div><span className={`text-xs rounded-full px-3 py-1 ${settings.speakerVerified?"bg-emerald-400/10 text-emerald-300":"bg-amber-400/10 text-amber-200"}`}><span className="inline-block h-2 w-2 rounded-full mr-2 bg-current"/>{settings.speakerVerified?"Confirmed by you":"Not yet confirmed"}</span></div><div className="grid md:grid-cols-2 gap-4"><div><label className="label">Speaker name</label><input className="field" value={settings.speakerName} onChange={e=>{setSpeakerTested(false);patch({speakerName:e.target.value,speakerVerified:false});}} placeholder="e.g. JBL Flip 6"/></div><div><label className="label">Bluetooth MAC address (optional)</label><input className="field" value={settings.speakerMac} onChange={e=>{setSpeakerTested(false);patch({speakerMac:e.target.value,speakerVerified:false});}} placeholder="AA:BB:CC:DD:EE:FF"/></div></div><div className="flex flex-wrap gap-2"><button className="btn btn-primary" onClick={openBluetoothSettings}><Bluetooth size={16}/> Open Bluetooth settings <ExternalLink size={13}/></button><button className="btn btn-secondary" onClick={testSpeaker}><Volume2 size={16}/> Test speaker</button>{speakerTested&&<button className="btn btn-secondary" onClick={confirmSpeaker}><Check size={16}/> I heard it on this speaker</button>}</div><div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm muted" role="status">{speakerMessage}</div><p className="text-xs muted">Browser limitation: a web page cannot reliably inspect A2DP speaker connection status or connect by MAC address. The test tone uses your operating system's current audio output; your confirmation is manual.</p></div><div className="panel p-6 space-y-5"><div><div className="eyebrow mb-1">Playback preferences</div><h2 className="text-xl font-bold">Make it yours</h2></div><div><label className="label">After the last song</label><select className="field" value={settings.endBehaviour} onChange={e=>patch({endBehaviour:e.target.value as Settings["endBehaviour"]})}><option value="stop">Stop playback</option><option value="repeat">Restart playlist</option><option value="next">Switch to another playlist</option></select></div>{settings.endBehaviour==="next"&&<div><label className="label">Next playlist URL</label><input className="field" value={settings.nextPlaylistUrl} onChange={e=>patch({nextPlaylistUrl:e.target.value})}/></div>}<div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Shuffle</div><div className="text-xs muted">Randomize individual-song queue</div></div><input className="switch" type="checkbox" checked={settings.shuffle} onChange={e=>patch({shuffle:e.target.checked})}/></div><div className="flex justify-between items-center"><div><div className="text-sm font-semibold">Gradual volume fade-in</div><div className="text-xs muted">Start quietly and rise to target</div></div><input className="switch" type="checkbox" checked={settings.fadeIn} onChange={e=>patch({fadeIn:e.target.checked})}/></div><div><div className="flex justify-between mb-2"><label className="label mb-0">Target volume</label><span className="text-sm font-semibold">{settings.volume}%</span></div><input className="w-full accent-amber-400" type="range" min="0" max="100" value={settings.volume} onChange={e=>patch({volume:Number(e.target.value)})}/></div><div><label className="label">Timezone</label><select className="field" value={settings.timezone} onChange={e=>patch({timezone:e.target.value})}><option value="Asia/Kolkata">India — Asia/Kolkata</option><option value="UTC">UTC</option><option value="America/New_York">New York</option><option value="Europe/London">London</option><option value="Asia/Singapore">Singapore</option></select></div><button className="btn btn-secondary w-full" onClick={()=>{localStorage.removeItem(STORAGE_KEY);setSettings(DEFAULT_SETTINGS);setStatus("Settings reset");}}>Reset to defaults</button></div></section>}
    <div className="mt-7 text-xs muted flex flex-wrap justify-between gap-3"><span>MorningTunes · Settings save automatically in this browser</span><span className="flex items-center gap-2"><Bluetooth size={13}/> Pair your Bluetooth speaker in device settings</span></div>
  </main>;
}
