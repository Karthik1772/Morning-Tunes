"use client";
import { RefObject, useEffect, useRef, useState } from "react";
import { targetVolume, type Settings, type Song } from "@/lib/types";
import { shuffleItems } from "@/lib/shuffle";
import { useYouTubePlayer } from "./useYouTubePlayer";

const WATCHDOG_MS = 15000;

/** Plays only the individual YouTube videos explicitly saved in the user's song queue. */
export function usePlayback(
  settings: Settings,
  host: RefObject<HTMLDivElement | null>,
) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [status, setStatus] = useState("Player is loading");
  const [playingTitle, setPlayingTitle] = useState("Nothing playing");
  const [fallback, setFallback] = useState(false);
  const queue = useRef<Song[]>([]);
  const index = useRef(0);
  const skips = useRef(0);
  const active = useRef(false);
  const isAlarm = useRef(false);
  const pendingStart = useRef(false);
  const ctx = useRef<AudioContext | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const self = useRef<Record<string, (...a: any[]) => void>>({});

  const { ready, loadError, api } = useYouTubePlayer(host, {
    onState: (s) => self.current.onYtState(s),
    onError: (c) => self.current.onYtError(c),
    onBlocked: () => self.current.onBlocked(),
  });
  const readyRef = useRef(false);
  readyRef.current = ready;

  const ensureCtx = () => {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    if (!ctx.current) ctx.current = new C();
    return ctx.current as AudioContext;
  };
  const unlock = async () => {
    api.unlock();
    const c = ensureCtx();
    try {
      await c?.resume();
      if (c) {
        const src = c.createBufferSource();
        src.buffer = c.createBuffer(1, 1, 22050);
        src.connect(c.destination);
        src.start(0);
      }
    } catch {}
  };
  const clearFade = () => {
    if (fadeTimer.current) {
      clearInterval(fadeTimer.current);
      fadeTimer.current = null;
    }
  };
  const clearWatchdog = () => {
    if (watchdog.current) {
      clearTimeout(watchdog.current);
      watchdog.current = null;
    }
  };
  const stopBeep = () => {
    if (beepTimer.current) {
      clearInterval(beepTimer.current);
      beepTimer.current = null;
    }
    setFallback(false);
  };
  const setVol = (v: number) => api.setVolume(v);
  const rampVolume = (target: number) => {
    clearFade();
    if (!settingsRef.current.fadeIn) {
      setVol(target);
      return;
    }
    let v = 0;
    setVol(0);
    fadeTimer.current = setInterval(() => {
      const latestTarget = targetVolume(settingsRef.current);
      v = Math.min(latestTarget, v + 5);
      setVol(v);
      if (v >= latestTarget) clearFade();
    }, 1200);
  };
  const startBeep = (why: string) => {
    if (beepTimer.current) return;
    setStatus(why);
    setPlayingTitle("Fallback alarm");
    setFallback(true);
    const c = ensureCtx();
    c?.resume().catch(() => {});
    const beep = () => {
      if (!c) return;
      const o = c.createOscillator(),
        g = c.createGain();
      o.frequency.value = 880;
      g.gain.value = Math.max(
        0.05,
        (targetVolume(settingsRef.current) / 100) * 0.5,
      );
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.4);
    };
    beep();
    beepTimer.current = setInterval(beep, 1000);
  };
  const armWatchdog = () => {
    clearWatchdog();
    watchdog.current = setTimeout(() => {
      if (active.current && isAlarm.current)
        startBeep("Music did not start, so the fallback alarm is playing");
    }, WATCHDOG_MS);
  };
  const finish = (msg: string) => {
    clearFade();
    clearWatchdog();
    stopBeep();
    api.stop();
    active.current = false;
    isAlarm.current = false;
    pendingStart.current = false;
    setStatus(msg);
    setPlayingTitle("Nothing playing");
  };
  const stop = () => finish("Playback stopped");
  const onPlaying = () => {
    clearWatchdog();
    skips.current = 0;
    if (beepTimer.current) stopBeep();
    setStatus("Playing");
  };
  const playIndex = (i: number, first = false) => {
    const songs = queue.current;
    if (i >= songs.length) {
      if (settingsRef.current.endBehaviour === "repeat" && songs.length) {
        skips.current = 0;
        playIndex(0);
      } else finish("Finished");
      return;
    }
    index.current = i;
    const song = songs[i];
    setPlayingTitle(song.title);
    setStatus(`Starting ${i + 1} of ${songs.length}`);
    api.loadVideo(song.videoId);
    if (first) rampVolume(targetVolume(settingsRef.current));
    else setVol(targetVolume(settingsRef.current));
  };
  const skipFailed = () => {
    skips.current++;
    if (skips.current >= Math.max(1, queue.current.length)) {
      if (isAlarm.current)
        startBeep(
          "No saved song could be played, so the fallback alarm is playing",
        );
      else {
        setStatus("None of the saved songs could be played");
        active.current = false;
      }
      return;
    }
    playIndex(index.current + 1);
  };
  const onBlocked = () => {
    if (!active.current) return;
    if (isAlarm.current)
      startBeep(
        "The browser blocked autoplay. Click Test playback once after opening the page to allow audio",
      );
    else
      setStatus(
        "The browser blocked autoplay. Click anywhere on the page, then try again",
      );
  };
  const onYtState = (state: number) => {
    if (!active.current) return;
    if (state === 1) onPlaying();
    else if (state === 2) setStatus("Paused");
    else if (state === 0) playIndex(index.current + 1);
  };
  const onYtError = (code: number) => {
    if (!active.current) return;
    setStatus(`Video unavailable (error ${code}), skipping`);
    skipFailed();
  };
  const start = (alarm: boolean) => {
    const s = settingsRef.current;
    clearFade();
    clearWatchdog();
    stopBeep();
    active.current = true;
    isAlarm.current = alarm;
    pendingStart.current = false;
    skips.current = 0;
    if (alarm) armWatchdog();
    const fail = (msg: string) => {
      if (alarm) startBeep(msg);
      else {
        setStatus(msg);
        active.current = false;
      }
    };
    if (!s.songs.length)
      return fail("Add at least one YouTube song to your queue");
    if (!readyRef.current) {
      pendingStart.current = true;
      setStatus("Waiting for the YouTube player to load");
      return;
    }
    queue.current = s.shuffle ? shuffleItems(s.songs) : [...s.songs];
    playIndex(0, true);
  };

  self.current = { onYtState, onYtError, onBlocked };
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const startRef = useRef(start);
  startRef.current = start;
  // Register with the browser/OS media session so playback is treated as active media
  // and can be controlled from browser media controls while another window is focused.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const mediaSession = navigator.mediaSession;

    if (
      typeof MediaMetadata !== "undefined" &&
      playingTitle !== "Nothing playing"
    ) {
      mediaSession.metadata = new MediaMetadata({
        title: playingTitle,
        artist: "MorningTunes",
        album: "Alarm queue",
        artwork: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
      });
    } else {
      mediaSession.metadata = null;
    }

    mediaSession.playbackState =
      status === "Playing" || status.startsWith("Starting")
        ? "playing"
        : status === "Paused"
          ? "paused"
          : "none";

    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {}
    };
    setHandler("play", () => api.play());
    setHandler("pause", () => api.pause());
    setHandler("stop", () => stopRef.current());

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("stop", null);
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
    };
  }, [api, playingTitle, status]);

  useEffect(() => {
    if (loadError) setStatus(loadError);
  }, [loadError]);
  useEffect(() => {
    if (active.current && !fadeTimer.current)
      api.setVolume(targetVolume(settings));
  }, [settings.volume, settings.followDeviceVolume, api]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ready) {
      setStatus((p) => (p === "Player is loading" ? "Player ready" : p));
      if (pendingStart.current) startRef.current(isAlarm.current);
    }
  }, [ready]);
  useEffect(
    () => () => {
      clearFade();
      clearWatchdog();
      stopBeep();
    },
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    ready,
    loadError,
    status,
    playingTitle,
    fallback,
    start,
    stop,
    unlock,
    setVolume: (volume: number) => api.setVolume(volume),
  };
}
