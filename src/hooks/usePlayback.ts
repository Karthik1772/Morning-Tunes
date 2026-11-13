"use client";
import { RefObject, useEffect, useRef, useState } from "react";
import type { Settings, Song } from "@/lib/types";
import { getPlaylistId } from "@/lib/youtube";
import { shuffled } from "@/lib/shuffle";
import { getFile } from "@/lib/localFiles";
import { SILENT_WAV } from "@/lib/silent";
import { useYouTubePlayer } from "./useYouTubePlayer";

const WATCHDOG_MS = 15000; // alarm with no sound after this long -> fallback beep

/**
 * Playback engine: a queue of YouTube videos and/or local files (or a YouTube playlist),
 * volume fade-in once per run, skip-on-error, and a fallback beep so the alarm is never silent.
 */
export function usePlayback(settings: Settings, host: RefObject<HTMLDivElement | null>) {
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [status, setStatus] = useState("Player is loading");
  const [playingTitle, setPlayingTitle] = useState("Nothing playing");
  const [fallback, setFallback] = useState(false);

  const queue = useRef<Song[]>([]);
  const index = useRef(0);
  const skips = useRef(0);
  const active = useRef(false);
  const isAlarm = useRef(false);
  const pendingStart = useRef(false);
  const switchedToNext = useRef(false);
  const engine = useRef<"yt" | "audio" | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const self = useRef<Record<string, (...a: any[]) => void>>({}); // latest closures for long-lived event handlers

  const { ready, api } = useYouTubePlayer(host, {
    onState: (s) => self.current.onYtState(s),
    onError: (c) => self.current.onYtError(c),
    onBlocked: () => self.current.onBlocked(),
  });
  const readyRef = useRef(false); readyRef.current = ready;

  const ensureCtx = () => {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    if (!ctx.current) ctx.current = new C();
    return ctx.current as AudioContext;
  };
  const ensureAudio = () => {
    if (!audio.current) {
      const a = new Audio(); a.preload = "auto";
      a.onended = () => self.current.advance();
      a.onplaying = () => self.current.onPlaying();
      a.onerror = () => self.current.onLocalError();
      audio.current = a;
    }
    return audio.current;
  };

  /** Call from a click ("Arm"): lets this page make sound later without another gesture. */
  const unlock = async () => {
    const c = ensureCtx();
    try { await c?.resume(); if (c) { const src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0); } } catch {}
    const a = ensureAudio();
    try { a.src = SILENT_WAV; await a.play(); a.pause(); } catch {}
  };

  const clearFade = () => { if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; } };
  const clearWatchdog = () => { if (watchdog.current) { clearTimeout(watchdog.current); watchdog.current = null; } };
  const stopBeep = () => { if (beepTimer.current) { clearInterval(beepTimer.current); beepTimer.current = null; } setFallback(false); };
  const stopAudio = () => {
    audio.current?.pause();
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
  };
  const setVol = (v: number) => { api.setVolume(v); if (audio.current) audio.current.volume = Math.min(1, Math.max(0, v / 100)); };
  const rampVolume = (target: number) => {
    clearFade();
    if (!settingsRef.current.fadeIn) { setVol(target); return; }
    let v = 0; setVol(0);
    fadeTimer.current = setInterval(() => { v = Math.min(target, v + 5); setVol(v); if (v >= target) clearFade(); }, 1200);
  };

  const startBeep = (why: string) => {
    if (beepTimer.current) return;
    setStatus(why); setPlayingTitle("Fallback alarm"); setFallback(true);
    const c = ensureCtx(); c?.resume().catch(() => {});
    const beep = () => {
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; g.gain.value = Math.max(0.05, (settingsRef.current.volume / 100) * 0.5);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.4);
    };
    beep(); beepTimer.current = setInterval(beep, 1000);
  };
  const armWatchdog = () => {
    clearWatchdog();
    watchdog.current = setTimeout(() => { if (active.current && isAlarm.current) startBeep("Music did not start, so the fallback alarm is playing"); }, WATCHDOG_MS);
  };

  const finish = (msg: string) => {
    clearFade(); clearWatchdog(); stopBeep(); stopAudio(); api.stop();
    active.current = false; isAlarm.current = false; pendingStart.current = false; engine.current = null;
    setStatus(msg); setPlayingTitle("Nothing playing");
  };
  const stop = () => finish("Playback stopped");

  const onPlaying = () => { clearWatchdog(); skips.current = 0; if (beepTimer.current) stopBeep(); setStatus("Playing"); };
  const skipFailed = () => {
    skips.current++;
    if (skips.current >= Math.max(1, queue.current.length)) {
      if (isAlarm.current) startBeep("No song could be played, so the fallback alarm is playing");
      else { setStatus("No song in the queue could be played"); active.current = false; }
      return;
    }
    playIndex(index.current + 1);
  };
  const onBlocked = () => {
    if (!active.current) return;
    if (isAlarm.current) startBeep("The browser blocked autoplay. Press Arm after opening the page next time");
    else setStatus("The browser blocked autoplay. Click anywhere on the page, then try again");
  };
  const handleEnd = () => {
    const s = settingsRef.current;
    if (s.endBehaviour === "repeat") { if (s.musicSource === "songs") playIndex(0); else start(isAlarm.current); return; }
    if (s.endBehaviour === "next" && !switchedToNext.current) {
      const id = getPlaylistId(s.nextPlaylistUrl);
      if (id) { switchedToNext.current = true; stopAudio(); engine.current = "yt"; api.loadPlaylist(id); setPlayingTitle("Next playlist"); setStatus("Playing next playlist"); return; }
      setStatus("Next playlist URL is invalid");
    }
    finish("Finished");
  };
  const advance = () => { if (active.current) playIndex(index.current + 1); };
  const onYtState = (s: number) => {
    if (!active.current || engine.current !== "yt") return;
    if (s === 1) onPlaying();
    else if (s === 2) setStatus("Paused");
    else if (s === 0) { if (settingsRef.current.musicSource === "songs") advance(); else handleEnd(); }
  };
  const onYtError = (code: number) => {
    if (!active.current || engine.current !== "yt") return;
    setStatus(`Video unavailable (error ${code}), skipping`);
    if (settingsRef.current.musicSource === "songs") skipFailed();
    else if (++skips.current > 50) { if (isAlarm.current) startBeep("Nothing in the playlist could be played"); } else api.next();
  };
  const onLocalError = () => { if (active.current && engine.current === "audio") { setStatus("Could not play the local file, skipping"); skipFailed(); } };

  const playIndex = async (i: number, first = false) => {
    const q = queue.current;
    if (i >= q.length) { handleEnd(); return; }
    index.current = i; const song = q[i];
    setPlayingTitle(song.title); setStatus(`Starting ${i + 1} of ${q.length}`);
    const vol = settingsRef.current.volume;
    if (song.kind === "local") {
      let blob: Blob | undefined;
      try { blob = await getFile(song.id); } catch {}
      if (!active.current) return;
      if (!blob) { setStatus(`"${song.title}" is not stored on this device, skipping`); skipFailed(); return; }
      api.stop(); engine.current = "audio";
      const a = ensureAudio();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob); a.src = objectUrl.current;
      if (first) rampVolume(vol); else setVol(vol);
      try { await a.play(); }
      catch (err) { if (active.current) { if ((err as Error).name === "NotAllowedError") onBlocked(); else if ((err as Error).name !== "AbortError") skipFailed(); } }
    } else {
      stopAudio(); engine.current = "yt"; api.loadVideo(song.videoId!);
      if (first) rampVolume(vol); else setVol(vol);
    }
  };

  /** Start playback. `alarm` = true when the schedule triggered it (enables fallback beep + waiting for the player). */
  const start = (alarm: boolean) => {
    const s = settingsRef.current;
    clearFade(); clearWatchdog(); stopBeep(); stopAudio();
    active.current = true; isAlarm.current = alarm; pendingStart.current = false;
    skips.current = 0; switchedToNext.current = false;
    if (alarm) armWatchdog();
    const fail = (msg: string) => { if (alarm) startBeep(msg); else { setStatus(msg); active.current = false; } };
    const needsYt = s.musicSource === "playlist" || s.songs.some((x) => x.kind === "youtube");
    if (needsYt && !readyRef.current) { pendingStart.current = true; setStatus("Waiting for the YouTube player to load"); return; }
    if (s.musicSource === "songs") {
      if (!s.songs.length) return fail("There are no songs in the queue");
      queue.current = s.shuffle ? shuffled(s.songs) : [...s.songs];
      playIndex(0, true);
    } else {
      const id = getPlaylistId(s.playlistUrl);
      if (!id) return fail("Enter a valid YouTube playlist URL");
      engine.current = "yt"; api.loadPlaylist(id); api.setShuffle(!!s.shuffle); rampVolume(s.volume);
      setPlayingTitle("Your YouTube playlist"); setStatus("Starting YouTube playlist");
    }
  };

  self.current = { onYtState, onYtError, onBlocked, onPlaying, onLocalError, advance };
  const startRef = useRef(start); startRef.current = start;

  useEffect(() => { // alarm fired before the YouTube player finished loading
    if (ready) { setStatus((p) => (p === "Player is loading" ? "Player ready" : p)); if (pendingStart.current) startRef.current(isAlarm.current); }
  }, [ready]);
  useEffect(() => () => { clearFade(); clearWatchdog(); stopBeep(); stopAudio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, status, playingTitle, fallback, start, stop, unlock };
}
