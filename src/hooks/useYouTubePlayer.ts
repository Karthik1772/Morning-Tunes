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
    if (!container) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const init = () => {
      if (cancelled || player.current || !window.YT?.Player) return;
      if (poll) { clearInterval(poll); poll = null; }
      const el = document.createElement("div");
      container.appendChild(el);
      try {
        player.current = new window.YT.Player(el, {
          height: "180", width: "320",
          playerVars: { playsinline: 1, controls: 1, rel: 0, enablejsapi: 1 },
          events: {
            onReady: () => { if (!cancelled) { setLoadError(""); setReady(true); } },
            onStateChange: (e: any) => h.current.onState(e.data),
            onError: (e: any) => h.current.onError(e.data),
            onAutoplayBlocked: () => h.current.onBlocked(),
          },
        });
      } catch {
        setLoadError("The YouTube player could not initialize. Check network access or browser extensions.");
      }
    };

    if (window.YT?.Player) {
      init();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      const callback = () => { previous?.(); init(); };
      window.onYouTubeIframeAPIReady = callback;

      let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => {
          if (!cancelled) setLoadError("Couldn't load YouTube's player API. Check your internet connection, VPN, or ad blocker.");
        };
        document.head.appendChild(script);
      }

      // The API may already have loaded before this component registered its callback.
      // Polling closes that race and also handles an existing script tag.
      poll = setInterval(() => {
        if (window.YT?.Player) init();
      }, 150);
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
  }, [host]);

  const api = useMemo(() => ({
    loadVideo: (id: string) => player.current?.loadVideoById(id),
    setVolume: (v: number) => player.current?.setVolume(v),
    stop: () => player.current?.stopVideo(),
  }), []);
  return { ready, loadError, api };
}
