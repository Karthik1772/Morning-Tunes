/** Extracts a video ID from supported YouTube video links. */
export function extractYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;

    const directId = url.searchParams.get("v");
    if (directId) return directId;

    const segments = url.pathname.split("/").filter(Boolean);
    const videoTypeIndex = segments.findIndex((segment) => ["embed", "shorts", "live"].includes(segment));
    return videoTypeIndex >= 0 ? segments[videoTypeIndex + 1] ?? null : null;
  } catch { return null; }
}
