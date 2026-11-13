# MorningTunes

A lightweight Next.js YouTube playlist alarm dashboard.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## How it works

- Alarm, selected music source, playlist URL, individual-song queue and playback preferences are stored in this browser's localStorage.
- Keep the dashboard open in a browser tab on the device connected to your Bluetooth speaker.
- Choose either the YouTube playlist or your ordered individual-song queue in Music Library.
- Press **Test playback** once and grant browser audio/autoplay permission when prompted.
- The browser/device must remain powered on, awake, connected to the internet and connected to the speaker.
- Vercel hosts the web app; it does not run a background alarm when the browser is closed.

## YouTube notes

This app uses the official YouTube IFrame Player API. Playback is subject to YouTube availability, embedding restrictions, browser autoplay rules and account/region restrictions. Some videos do not allow embedding. Playlist-level controls are best-effort; individual video queues provide more deterministic stop/repeat/next-playlist behaviour.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Framework preset: Next.js; root directory: `.`.
4. Deploy. No environment variables are required.

## Browser support

Use a current desktop Chrome, Edge, Firefox or Safari browser. Bluetooth pairing and audio output are managed by the operating system. The browser must remain open and awake for the alarm to fire.
