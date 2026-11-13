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
    const container = host.current;
    if (!container) {
      setLoadError("The video player area could not be mounted. Refresh the page.");
      return;
    }

    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    let apiTimeout: ReturnType<typeof setTimeout> | undefined;
    let script: HTMLScriptElement | null = null;
    let previousReadyCallback: (() => void) | undefined;

    const clearTimers = () => {
      if (poll) clearInterval(poll);
      if (readyTimeout) clearTimeout(readyTimeout);
      if (apiTimeout) clearTimeout(apiTimeout);
      poll = undefined;
      readyTimeout = undefined;
      apiTimeout = undefined;
    };

    const fail = (message: string) => {
      if (cancelled) return;
      clearTimers();
      setLoadError(message);
    };

    const init = () => {
      if (cancelled || player.current || !window.YT?.Player) return;
      clearTimers();
      setLoadError("");

      const mount = document.createElement("div");
      mount.className = "youtube-player-mount";
      container.replaceChildren(mount);

      try {
        player.current = new window.YT.Player(mount, {
          width: "640",
          height: "360",
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            controls: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            widget_referrer: window.location.href,
          },
          events: {
            onReady: (event: any) => {
              if (cancelled) return;
              readyRef.current = true;
              clearTimers();
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
                const message = code === 153
                  ? "YouTube blocked this embed because browser identification/referrer information was unavailable (error 153). Allow referrers for this site and disable privacy extensions for testing."
                  : `YouTube could not initialize the embedded player (error ${code}). Check whether embedding is allowed and youtube.com is accessible.`;
                fail(message);
              } else {
                h.current.onError(code);
              }
            },
            onAutoplayBlocked: () => h.current.onBlocked(),
          },
        });
        readyTimeout = setTimeout(() => {
          if (!cancelled && !readyRef.current) {
            fail("YouTube's API loaded, but its video frame never became ready. Check browser extensions, network restrictions, and youtube.com access.");
          }
        }, 15000);
      } catch {
        fail("The YouTube player could not initialize. Check network access and browser extensions.");
      }
    };

    readyRef.current = false;
    setReady(false);
    container.replaceChildren();

    if (window.YT?.Player) {
      init();
    } else {
      previousReadyCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { previousReadyCallback?.(); } finally { init(); }
      };

      script = document.querySelector<HTMLScriptElement>(`script[src="${API_URL}"]`);
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
        if (!cancelled && !window.YT?.Player) {
          fail("Timed out loading YouTube's player API. Check whether youtube.com is blocked by your network, VPN, DNS filter, or browser extension.");
        }
      }, 15000);
      poll = setInterval(() => {
        if (window.YT?.Player) init();
      }, 100);
    }

    return () => {
      cancelled = true;
      clearTimers();
      if (window.onYouTubeIframeAPIReady && previousReadyCallback) {
        window.onYouTubeIframeAPIReady = previousReadyCallback;
      }
    };
  }, [host]);

  const api = useMemo(() => ({
    loadVideo: (id: string) => player.current?.loadVideoById(id),
    setVolume: (volume: number) => player.current?.setVolume(volume),
    stop: () => player.current?.stopVideo(),
  }), []);

  return { ready, loadError, api };
}
