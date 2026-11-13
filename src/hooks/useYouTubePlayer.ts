"use client";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
export type YTHandlers = { onState: (state: number) => void; onError: (code: number) => void; onBlocked: () => void };

const API_URL = "https://www.youtube.com/iframe_api";

export function useYouTubePlayer(host: RefObject<HTMLDivElement | null>, handlers: YTHandlers) {
  const player = useRef<any>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    let cancelled = false;
    let hostPoll: ReturnType<typeof setInterval> | undefined;
    let apiPoll: ReturnType<typeof setInterval> | undefined;
    let hostTimeout: ReturnType<typeof setTimeout> | undefined;
    let apiTimeout: ReturnType<typeof setTimeout> | undefined;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    let previousReadyCallback: (() => void) | undefined;
    let apiCallback: (() => void) | undefined;
    let container: HTMLDivElement | null = null;

    const clear = () => {
      if (hostPoll) clearInterval(hostPoll);
      if (apiPoll) clearInterval(apiPoll);
      if (hostTimeout) clearTimeout(hostTimeout);
      if (apiTimeout) clearTimeout(apiTimeout);
      if (readyTimeout) clearTimeout(readyTimeout);
      hostPoll = apiPoll = undefined;
      hostTimeout = apiTimeout = readyTimeout = undefined;
    };

    const fail = (message: string) => {
      if (cancelled) return;
      clear();
      setLoadError(message);
    };

    const initializePlayer = () => {
      if (cancelled || !container || player.current || !window.YT?.Player) return;
      clear();
      setLoadError("");
      const mount = document.createElement("div");
      mount.className = "youtube-player-mount";
      container.replaceChildren(mount);

      try {
        player.current = new window.YT.Player(mount, {
          width: "640",
          height: "360",
          playerVars: {
            autoplay: 0, playsinline: 1, controls: 1, rel: 0,
            enablejsapi: 1, origin: window.location.origin,
            widget_referrer: window.location.href,
          },
          events: {
            onReady: (event: any) => {
              if (cancelled) return;
              readyRef.current = true;
              clear();
              const iframe = event?.target?.getIframe?.();
              if (iframe) {
                iframe.title = "MorningTunes YouTube music player";
                iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
                iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
                iframe.classList.add("youtube-player-iframe");
              }
              setLoadError("");
              setReady(true);
            },
            onStateChange: (event: any) => h.current.onState(event.data),
            onError: (event: any) => {
              const code = Number(event?.data);
              if (!readyRef.current) {
                fail(code === 153
                  ? "YouTube blocked the embed because browser identification/referrer information was unavailable (error 153)."
                  : `YouTube could not initialize the embedded player (error ${code}).`);
              } else h.current.onError(code);
            },
            onAutoplayBlocked: () => h.current.onBlocked(),
          },
        });
        readyTimeout = setTimeout(() => {
          if (!cancelled && !readyRef.current) fail("YouTube's API loaded, but the video frame did not become ready. Check youtube.com access and browser privacy settings.");
        }, 15000);
      } catch {
        fail("The YouTube player could not initialize. Check network access and browser extensions.");
      }
    };

    const loadApi = () => {
      if (cancelled || !container) return;
      if (window.YT?.Player) {
        initializePlayer();
        return;
      }

      previousReadyCallback = window.onYouTubeIframeAPIReady;
      apiCallback = () => {
        try { previousReadyCallback?.(); } finally { initializePlayer(); }
      };
      window.onYouTubeIframeAPIReady = apiCallback;

      let script = document.querySelector<HTMLScriptElement>(`script[src="${API_URL}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = API_URL;
        script.async = true;
        script.onerror = () => fail("The YouTube player API download was blocked. Check your connection, VPN, DNS filter, or ad blocker.");
        document.head.appendChild(script);
      } else {
        script.addEventListener("error", () => fail("The YouTube player API download was blocked. Check your connection, VPN, DNS filter, or ad blocker."), { once: true });
      }

      apiTimeout = setTimeout(() => {
        if (!cancelled && !window.YT?.Player) fail("Timed out loading YouTube's player API. Check whether youtube.com is blocked by your network or browser.");
      }, 15000);
      apiPoll = setInterval(() => {
        if (window.YT?.Player) initializePlayer();
      }, 100);
    };

    readyRef.current = false;
    setReady(false);
    setLoadError("");

    // The dashboard initially renders a loading screen while settings hydrate.
    // Its player host is mounted later, so wait for the ref instead of failing on the first render.
    if (host.current) {
      container = host.current;
      loadApi();
    } else {
      hostPoll = setInterval(() => {
        if (host.current) {
          container = host.current;
          if (hostPoll) clearInterval(hostPoll);
          hostPoll = undefined;
          if (hostTimeout) clearTimeout(hostTimeout);
          hostTimeout = undefined;
          loadApi();
        }
      }, 100);
      hostTimeout = setTimeout(() => {
        if (!container && !cancelled) fail("The video player area did not mount. Refresh the page and try again.");
      }, 20000);
    }

    return () => {
      cancelled = true;
      clear();
      if (apiCallback && window.onYouTubeIframeAPIReady === apiCallback) {
        window.onYouTubeIframeAPIReady = previousReadyCallback;
      }
    };
  }, [host]);

  const api = useMemo(() => ({
    loadVideo: (id: string) => player.current?.loadVideoById(id),
    setVolume: (volume: number) => player.current?.setVolume(volume),
    stop: () => player.current?.stopVideo(),
    unlock: () => {
      const currentPlayer = player.current;
      if (!readyRef.current || !currentPlayer) return;
      // Prime YouTube playback during the user click that enables the alarm.
      currentPlayer.mute();
      currentPlayer.setVolume(0);
      currentPlayer.playVideo();
      currentPlayer.pauseVideo();
      currentPlayer.unMute();
    },
  }), []);

  return { ready, loadError, api };
}
