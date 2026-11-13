# MorningTunes

A browser-based YouTube alarm. Add individual YouTube video URLs to your song queue, choose an alarm time and repeat schedule, and play through the audio output selected by your device (including a paired Bluetooth speaker).

## How it works

- Add songs one at a time using individual YouTube video URLs. YouTube playlists are not supported.
- The alarm plays only the videos explicitly saved in your queue, in order or shuffled.
- Choose whether playback stops after the last saved song or repeats the same queue.
- The browser tab is the alarm player. Keep MorningTunes open and the device awake at alarm time.
- Click **Arm this device** (or enable the alarm) after opening the page so the browser can unlock audio.
- The alarm checks every second and on tab focus/wake. If the device wakes late, it can still fire within 10 minutes of the scheduled time, once per day.
- If a saved YouTube video cannot be embedded or played, it is skipped. If no song starts during an alarm, a fallback beep sounds until you press Stop.
- Bluetooth pairing and output selection are managed by your device OS. The web app cannot connect to Bluetooth by MAC address or guarantee playback when the browser is closed.

## Run locally

```bash
npm install
npm run dev
npm test
npm run typecheck
```

## Deploy

Deploy the Next.js project to Vercel. No environment variables are required for single-device use.

## Optional cross-device sync

To share alarm settings and your individual YouTube song queue between devices, configure Upstash Redis in Vercel:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `MORNINGTUNES_PASSCODE`

Redeploy, then enter the same passcode in Settings on each device. Changes sync through the authenticated settings API. Each device still needs its own browser tab open and armed to play an alarm.

## YouTube playback

MorningTunes uses the official YouTube IFrame Player API. Playback is subject to YouTube embedding restrictions, regional availability, account limits, network connectivity, and browser autoplay rules. A browser tab cannot reliably sound an alarm after it has been closed, nor can a sleeping or powered-off device execute the alarm.
