"use client";
import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, HardDrive, Plus, Trash2, Upload, Youtube, ListMusic } from "lucide-react";
import type { Settings, Song } from "@/lib/types";
import { getVideoId } from "@/lib/youtube";
import { deleteFile, saveFile } from "@/lib/localFiles";
import { uid } from "@/lib/uid";

type Props = { settings: Settings; patch: (p: Partial<Settings>) => void; localIds: Set<string>; refreshLocal: () => Promise<void> };
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i;

export default function LibraryTab({ settings, patch, localIds, refreshLocal }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const addSong = () => {
    const videoId = getVideoId(url);
    if (!videoId) { setMsg("Enter a valid YouTube video URL"); return; }
    const song: Song = { id: uid(), kind: "youtube", videoId, title: title.trim() || `Song ${settings.songs.length + 1}`, url: `https://www.youtube.com/watch?v=${videoId}` };
    patch({ songs: [...settings.songs, song] }); setUrl(""); setTitle(""); setMsg("");
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: Song[] = []; let skipped = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("audio/") && !AUDIO_EXT.test(f.name)) { skipped++; continue; }
      const id = uid();
      try { await saveFile(id, f); added.push({ id, kind: "local", title: f.name.replace(/\.[^.]+$/, "") }); } catch { skipped++; }
    }
    if (added.length) patch({ songs: [...settings.songs, ...added] });
    await refreshLocal();
    setMsg(`${added.length ? `Added ${added.length} file(s) to this device. ` : ""}${skipped ? `${skipped} file(s) skipped (not audio or could not be stored).` : ""}`.trim());
    if (fileInput.current) fileInput.current.value = "";
  };
  const move = (i: number, d: number) => {
    const a = [...settings.songs], j = i + d; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; patch({ songs: a });
  };
  const remove = (s: Song) => { patch({ songs: settings.songs.filter((x) => x.id !== s.id) }); if (s.kind === "local") void deleteFile(s.id).then(refreshLocal); };

  return (
    <section className="panel p-6">
      <div className="eyebrow mb-1">Your music</div>
      <h2 className="text-xl font-bold mb-5">Music library</h2>
      <label className="label">Playback source</label>
      <div className="flex gap-2 mb-5">
        <button className={`btn ${settings.musicSource === "playlist" ? "btn-primary" : "btn-secondary"}`} onClick={() => patch({ musicSource: "playlist" })}><ListMusic size={15} /> YouTube playlist</button>
        <button className={`btn ${settings.musicSource === "songs" ? "btn-primary" : "btn-secondary"}`} onClick={() => patch({ musicSource: "songs" })}><Youtube size={15} /> Song queue (YouTube + local files)</button>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div><label className="label">YouTube playlist URL</label><input className="field" value={settings.playlistUrl} onChange={(e) => patch({ playlistUrl: e.target.value })} /></div>
        <div className="flex items-end"><a className="btn btn-secondary w-full" href={settings.playlistUrl} target="_blank" rel="noreferrer"><Youtube size={16} /> Open playlist</a></div>
      </div>
      <div className="border-t border-slate-700 pt-5">
        <h3 className="font-semibold mb-3">Add to the song queue</h3>
        <div className="grid md:grid-cols-[1fr_1.4fr_auto] gap-2">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title (optional)" />
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste YouTube video URL" />
          <button className="btn btn-primary" onClick={addSong}><Plus size={15} /> Add song</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.flac,.opus" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}><Upload size={15} /> Add local audio files</button>
          <span className="text-xs muted">Files are stored in this browser only and play only on this device.</span>
        </div>
        {msg && <p className="text-xs mt-3 text-amber-200" role="status">{msg}</p>}
      </div>
      <div className="mt-6 space-y-2">
        {settings.songs.length === 0 ? <p className="muted text-sm py-6 text-center">No songs in the queue yet.</p> : settings.songs.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            {s.kind === "local" ? <HardDrive size={17} className="text-sky-300" /> : <Youtube size={17} className="text-red-400" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{s.title}</div>
              {s.kind === "youtube" ? <a className="text-xs muted" href={s.url} target="_blank" rel="noreferrer">Open video</a>
                : <span className={`text-xs ${localIds.has(s.id) ? "text-emerald-300" : "text-amber-200"}`}>{localIds.has(s.id) ? "Stored on this device" : "File is on another device: it will be skipped here"}</span>}
            </div>
            <span className="text-xs muted">#{i + 1}</span>
            <button aria-label="Move up" onClick={() => move(i, -1)}><ChevronUp size={17} /></button>
            <button aria-label="Move down" onClick={() => move(i, 1)}><ChevronDown size={17} /></button>
            <button aria-label="Remove song" onClick={() => remove(s)}><Trash2 size={16} className="text-rose-300" /></button>
          </div>
        ))}
      </div>
      <p className="text-xs muted mt-5">Choose the source above to decide what the alarm plays. If a song can&apos;t play (for example a video that blocks embedding), the alarm skips to the next one.</p>
    </section>
  );
}
