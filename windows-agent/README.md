# MorningTunes Windows agent

Plays your alarm on a **Bluetooth speaker from a sleeping Windows laptop**, with no browser tab open.
Your Vercel dashboard stays the control panel (phone included). The agent reads the same synced settings.

```
 phone / dashboard ──► Vercel + Upstash ◄── agent (every 10 min) ──► Windows Task Scheduler
                                                                          │ wakes PC at alarm − 3 min
                                                                          ▼
                                       Play-Alarm.ps1: fresh settings → reconnect speaker → mpv → YouTube / local files
```

## What you need
- Windows 10/11 laptop, **plugged in**, lid-close action set to *Do nothing* (Power Options).
- Dashboard deployed with **cross-device sync** working (see the main README: Upstash + `MORNINGTUNES_PASSCODE`).
- `winget install mpv` and `winget install yt-dlp`
- Speaker paired in Windows once.

## Install (about 3 minutes)
Open **PowerShell as Administrator** in this folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Setup-Agent.ps1
```
It asks for your dashboard URL, the speaker's name (as Windows shows it), an optional local-music folder and your
sync passcode (stored encrypted for your Windows user only). Then, in the dashboard:

1. Settings → enter the sync passcode.
2. **Play the alarm on → Windows agent**, and switch the alarm **on**.
3. Within ~10 minutes the dashboard shows *"Windows agent checked in … Armed. Next alarm …"*.

Test right away (plays now, ignores the schedule): `.\Play-Alarm.ps1 -Now`

## How it behaves
| Situation | What happens |
|---|---|
| Alarm settings changed on the phone | Agent re-registers the wake task within ~10 min (if the laptop is awake). At alarm time it also pulls the **latest** settings, so volume/source/on-off changes apply even if the sync hadn't run. |
| Laptop asleep at alarm time | Task Scheduler wakes it 3 min early (`wakeLeadMinutes`), waits for Wi-Fi, reconnects the speaker, then starts at the exact time. |
| Speaker won't connect (6 tries) | Not played. Dashboard shows *speaker-failed*. Set `fallbackToDefaultOutput` to `true` to use the laptop speakers instead. |
| YouTube video/playlist fails | mpv skips unplayable items. If nothing plays for 20 s, a beep plays through the speaker for 5 min (`fallbackBeepMinutes`). |
| Dashboard offline at alarm time | Uses the last cached settings and logs a warning. |
| Woke more than 10 min late | Skipped (same grace window as the browser alarm). Plays once per alarm. |
| Playback length | Stops after `maxPlayMinutes` (default 60; `0` = no limit). |

Settings mapped from the dashboard: time, schedule/custom days, timezone, music source (playlist or song queue),
shuffle, **fade-in** (+5% every 1.2 s, once), volume, and *after the last song* (stop / restart / next playlist).

**Local files:** the dashboard stores local songs inside the browser, so the agent finds them by **file name** in
`localMusicDir` (e.g. song "Sunrise" ⇒ `Sunrise.mp3`). Keep a copy of those files in that folder.

## Files
- `agent-config.json` – your machine's settings (created by Setup; git-ignored). See `agent-config.example.json`.
- `Sync-Agent.ps1` – every 10 min/at logon: reads settings, keeps the `MorningTunes-Alarm` wake task correct, reports status.
- `Play-Alarm.ps1` – what the wake task runs.
- `Common.ps1` – shared code. `Uninstall-Agent.ps1` – removes both tasks.
- `agent.log` – look here first when something doesn't fire.

## Limits (be aware)
- Needs **Task Scheduler wake timers**. Run `powercfg /a`: if only *Standby (S0 Low Power Idle)* is listed, wake timers can be unreliable on that laptop. Test overnight; the fallback is to set sleep to **Never** while plugged in.
- Windows can't "connect" a Bluetooth device from a script. The agent toggles the paired device off/on to force a reconnect; this works when the speaker is on and in range.
- A dead battery or power cut = no alarm. You must stay logged in (locked is fine; signed-out/shut-down is not).
- If you change the alarm on the phone while the laptop is asleep, the old wake time still applies until the laptop is next awake. If the new time is only a little later (up to ~13 min) it waits; a bigger change in either direction is skipped until the agent next syncs.
- Security: the agent only ever plays YouTube links rebuilt from validated video/playlist IDs and files from your `localMusicDir`. It never runs anything taken from the dashboard.
