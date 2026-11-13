# MorningTunes

A Next.js alarm dashboard that wakes you with your own music (YouTube playlist, YouTube songs, or local audio files) through a Bluetooth speaker.

## How it works

The **player** is a browser tab on the device paired with your speaker (your laptop). The dashboard schedules and plays; Vercel only hosts the page. The tab must stay open and the device must be awake at alarm time.

- **Alarm:** checked every second and on wake/focus. If the device wakes up late, it still fires within **10 minutes** of the alarm time, once per day.
- **Arm:** browsers block sound until you click once on a page. Turning the alarm on (or pressing **Arm this device**) unlocks audio for that tab. After a reload the page asks you to arm again, so the alarm is never "on" but silent without warning.
- **Never silent:** if a video can't be embedded, it skips to the next song. If nothing plays within 15 seconds of the alarm, a fallback beep plays until you press Stop.
- **Music:** a YouTube playlist, or a song queue mixing YouTube links and local audio files. Local files are stored in this browser (IndexedDB), never uploaded, and play only on that device.
- **Fade-in** happens once at the start, not on every track.

## Run locally

```
npm install
npm run dev        # http://localhost:3000
npm test           # alarm-logic unit tests
npm run typecheck
```

## Deploy

Import the repo in Vercel (Next.js preset, no required environment variables).

## Cross-device sync (control it from your phone)

Optional. Without it, settings live only in each browser.

1. Create a free Redis database at [Upstash](https://upstash.com) (or add the Upstash Redis integration in Vercel).
2. In Vercel → Project → Settings → Environment Variables, set:
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (the integration may name them `KV_REST_API_URL` / `KV_REST_API_TOKEN`; both work)
   - `MORNINGTUNES_PASSCODE`: a long passphrase only you know
3. Redeploy, then open **Settings → Cross-device sync** on each device and enter the passcode.

Alarm settings and the song queue then sync (last change wins, within about 30 seconds). The phone also shows whether the laptop tab is online and armed. The API refuses all requests unless all three variables are set and the passcode matches. Speaker settings and local files stay per device.

## Laptop wake-up guide (laptop sleeps overnight)

A sleeping laptop runs no code, so schedule a wake a couple of minutes before the alarm (examples for a 6:00 alarm). Leave the MorningTunes tab open and **armed** before you sleep the laptop, and have the speaker on and set to auto-connect (make it the default output device).


**Windows** (PowerShell, as the user who owns the laptop):
```powershell
$a = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c exit"
$t = New-ScheduledTaskTrigger -Daily -At 5:58am
$s = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName "MorningTunesWake" -Action $a -Trigger $t -Settings $s
```
Also enable *Power Options → Advanced → Sleep → Allow wake timers*.

**macOS**
```
sudo pmset repeat wakeorpoweron MTWRFSU 05:58:00
```
Remove with `sudo pmset repeat cancel`.

**Linux** (suspends now, wakes tomorrow at 05:58; run it when you go to bed)
```
sudo rtcwake -m mem -l -t $(date -d 'tomorrow 05:58' +%s)
```

Wake behaviour varies by machine. **Test the night before**, in the same position you'll really leave it (lid open or closed, plugged in or on battery). Some laptops don't wake on a timer with the lid closed or on battery, and some go back to sleep within a couple of minutes, so stay close to the alarm time. If it proves unreliable, an always-on device (such as a Raspberry Pi running the same page in a browser) avoids all of this.

## Bluetooth notes

A web page cannot connect to a speaker by MAC address or read its connection state. The OS reconnects to the paired speaker; the MAC field is only a note for yourself, and **Test speaker** plays a tone through the current output for you to confirm by ear.

## YouTube notes

Uses the official YouTube IFrame Player API, so playback is subject to embedding restrictions, region/account limits and the browser's autoplay rules.
