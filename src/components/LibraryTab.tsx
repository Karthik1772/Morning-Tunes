"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Youtube } from "lucide-react";
import type { Settings, Song } from "@/lib/types";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { uid } from "@/lib/uid";

type Props = { settings: Settings; patch: (p: Partial<Settings>) => void };

export default function LibraryTab({ settings, patch }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");

  const addSong = () => {
    const videoId = extractYouTubeVideoId(url.trim());
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) { setMsg("Enter a valid YouTube video URL"); return; }
    if (settings.songs.some((song) => song.videoId === videoId)) { setMsg("That song is already in your queue"); return; }
    const song: Song = { id: uid(), kind: "youtube", videoId, title: title.trim() || `Song ${settings.songs.length + 1}`, url: `https://www.youtube.com/watch?v=${videoId}` };
    patch({ songs: [...settings.songs, song] });
    setUrl(""); setTitle(""); setMsg("");
  };
  const move = (i: number, d: number) => {
    const songs = [...settings.songs], j = i + d;
    if (j < 0 || j >= songs.length) return;
    [songs[i], songs[j]] = [songs[j], songs[i]];
    patch({ songs });
  };
  const remove = (song: Song) => patch({ songs: settings.songs.filter((x) => x.id !== song.id) });

  return (
    <section className="panel p-6">
      <div className="eyebrow mb-1">Your music</div>
      <h2 className="text-xl font-bold mb-5">Song queue</h2>
      <div className="border-t border-slate-700 pt-5">
        <h3 className="font-semibold mb-3">Add songs one at a time</h3>
        <div className="grid md:grid-cols-[1fr_1.4fr_auto] gap-2">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title (optional)" />
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSong(); }} placeholder="Paste one YouTube video URL" />
          <button className="btn btn-primary" onClick={addSong}><Plus size={15} /> Add song</button>
        </div>
        {msg && <p className="text-xs mt-3 text-amber-200" role="status">{msg}</p>}
      </div>
      <div className="mt-6 space-y-2">
        {settings.songs.length === 0 ? <p className="muted text-sm py-6 text-center">No songs added yet. Add individual YouTube video URLs above.</p> : settings.songs.map((song, i) => (
          <div key={song.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <Youtube size={17} className="text-red-400" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{song.title}</div>
              <a className="text-xs muted" href={song.url} target="_blank" rel="noreferrer">Open video</a>
            </div>
            <span className="text-xs muted">#{i + 1}</span>
            <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={17} /></button>
            <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === settings.songs.length - 1}><ChevronDown size={17} /></button>
            <button aria-label="Remove song" onClick={() => remove(song)}><Trash2 size={16} className="text-rose-300" /></button>
          </div>
        ))}
      </div>
      <p className="text-xs muted mt-5">Only the individual videos in this queue are played. Videos are played in order; unavailable videos are skipped. Enable repeat to restart this same queue.</p>
    </section>
  );
}