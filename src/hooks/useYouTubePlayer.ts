"use client";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
export type YTHandlers = { onState: (state: number) => void; onError: (code: number) => void; onBlocked: () => void };

export function useYouTubePlayer(host: RefObject<HTMLDivElement | null>, handlers: YTHandlers) {
  const player = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const h = useRef(handlers); h.current = handlers; // events always call the latest handlers

  useEffect(() => {
    const container = host.current; if (!container) return;
    let cancelled = false;
    const init = () => {
      if (cancelled || player.current || !window.YT?.Player) return;
      const el = document.createElement("div"); // YT replaces this node; React never owns it
      container.appendChild(el);
      player.current = new window.YT.Player(el, {
        height: "180", width: "320",
        playerVars: { playsinline: 1, controls: 1, rel: 0, enablejsapi: 1 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: any) => h.current.onState(e.data),
          onError: (e: any) => h.current.onError(e.data),
          onAutoplayBlocked: () => h.current.onBlocked(),
        },
      });
    };
    if (window.YT?.Player) init();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); init(); };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
      }
    }
    return () => { cancelled = true; };
  }, [host]);

  const api = useMemo(() => ({
    loadVideo: (id: string) => player.current?.loadVideoById(id),
    loadPlaylist: (id: string) => player.current?.loadPlaylist({ listType: "playlist", list: id, index: 0 }),
    setShuffle: (on: boolean) => player.current?.setShuffle(on),
    setVolume: (v: number) => player.current?.setVolume(v),
    next: () => player.current?.nextVideo(),
    stop: () => player.current?.stopVideo(),
  }), []);
  return { ready, api };
}
