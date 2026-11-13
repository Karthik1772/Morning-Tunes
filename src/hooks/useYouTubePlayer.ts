"use client";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
export type YTHandlers = { onState: (state: number) => void; onError: (code: number) => void; onBlocked: () => void };

export function useYouTubePlayer(host: RefObject<HTMLDivElement | null>, handlers: YTHandlers) {
  const player = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const h = useRef(handlers); h.current = handlers;

  useEffect(() => {
    const container = host.current;
    if (!container) { setLoadError("Player container was not mounted. Refresh the page."); return; }
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let readyTimeout: ReturnType<typeof setTimeout> | null = null;
    let apiTimeout: ReturnType<typeof setTimeout> | null = null;

    const cleanupTimers = () => {
      if (poll) { clearInterval(poll); poll = null; }
      if (readyTimeout) { clearTimeout(readyTimeout); readyTimeout = null; }
      if (apiTimeout) { clearTimeout(apiTimeout); apiTimeout = null; }
    };

    const init = () => {
      if (cancelled || player.current || !window.YT?.Player) return;
      if (poll) { clearInterval(poll); poll = null; }
      if (apiTimeout) { clearTimeout(apiTimeout); apiTimeout = null; }
      setLoadError("");
      const el = document.createElement("div");
      container.appendChild(el);
      try {
        player.current = new window.YT.Player(el, {
          height: "180", width: "320",
          playerVars: { playsinline: 1, controls: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              if (cancelled) return;
              cleanupTimers();
              setLoadError("");
              setReady(true);
            },
            onStateChange: (e: any) => h.current.onState(e.data),
            onError: (e: any) => {
              if (!ready) setLoadError(`YouTube player initialization error (${e.data}).`);
              else h.current.onError(e.data);
            },
            onAutoplayBlocked: () => h.current.onBlocked(),
          },
        });
        readyTimeout = setTimeout(() => {
          if (!cancelled && !ready) setLoadError("YouTube's API loaded, but its embedded player did not become ready. Check browser extensions, network restrictions, and whether youtube.com is accessible.");
        }, 12000);
      } catch (err) {
        setLoadError("The YouTube player could not initialize. Check network access or browser extensions.");
      }
    };

    if (window.YT?.Player) {
      init();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); init(); };

      let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => {
          if (!cancelled) {
            cleanupTimers();
            setLoadError("The YouTube API script was blocked or could not be downloaded. Check your internet connection, VPN, DNS filter, or ad blocker.");
          }
        };
        document.head.appendChild(script);
      }
      apiTimeout = setTimeout(() => {
        if (!cancelled && !window.YT?.Player) {
          cleanupTimers();
          setLoadError("Timed out loading YouTube's API. Check whether your network or an extension is blocking youtube.com.");
        }
      }, 12000);
      poll = setInterval(() => { if (window.YT?.Player) init(); }, 150);
    }

    return () => { cancelled = true; cleanupTimers(); };
  }, [host]);

  const api = useMemo(() => ({
    loadVideo: (id: string) => player.current?.loadVideoById(id),
    setVolume: (v: number) => player.current?.setVolume(v),
    stop: () => player.current?.stopVideo(),
  }), []);
  return { ready, loadError, api };
}
