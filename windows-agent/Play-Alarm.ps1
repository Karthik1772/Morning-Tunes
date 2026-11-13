# Play-Alarm.ps1 - what the "MorningTunes-Alarm" task runs after waking the PC.
#   .\Play-Alarm.ps1 -Now     test: play immediately, ignoring schedule / on-off switch
param([switch]$Now)
. (Join-Path $PSScriptRoot 'Common.ps1')

$cfg = $null
try {
    $cfg = Get-AgentConfig
    Write-Log '=== Alarm task started ==='
    Start-Sleep -Seconds 5   # let the PC finish waking up

    # 1) Fresh settings (internet may take a moment after wake); fall back to the last cached copy.
    [void](Wait-Internet 90)
    $remote = Get-RemoteSettings $cfg
    if (-not $remote -or -not $remote.Raw) { Write-Log 'No settings available.'; Send-AgentStatus $cfg 'error' 'No settings available at alarm time'; exit 1 }
    $S = ConvertTo-SafeSettings $remote.Raw
    if ($remote.FromCache) { Write-Log 'WARNING: playing from cached settings (dashboard unreachable).' }

    # 2) Should it sound now?
    $due = $null
    if ($Now) { $due = [datetime]::UtcNow }
    else {
        if (-not $S.Enabled -or $S.PlayOn -ne 'agent') { Write-Log 'Alarm is off or set to the browser - nothing to do.'; Send-AgentStatus $cfg 'skipped' 'Alarm is off or plays in the browser'; exit 0 }
        $due = Find-DueAlarm $S ([int]$cfg.wakeLeadMinutes)
        if (-not $due) { Write-Log 'No alarm is due right now (settings changed or the task ran late) - skipping.'; Send-AgentStatus $cfg 'skipped' 'Task ran but no alarm was due'; exit 0 }
        $state = Get-AgentState
        if ($state.lastPlayed -eq $due.ToString('o')) { Write-Log 'This alarm already played - skipping.'; exit 0 }
    }

    # 3) Tools
    $mpv   = Resolve-Tool $cfg.mpvPath 'mpv'
    $ytdlp = Resolve-Tool $cfg.ytdlpPath 'yt-dlp'
    if (-not $mpv) { throw 'mpv not found. Install it: winget install mpv   (then re-run Setup-Agent.ps1)' }
    if (-not $ytdlp) { Write-Log 'Note: yt-dlp not found; YouTube may fail. Install it: winget install yt-dlp' }

    # 4) Bluetooth speaker
    $device = Connect-Speaker $cfg $mpv
    if (-not $device) {
        if ($cfg.fallbackToDefaultOutput) { Write-Log 'Speaker unavailable - using the default audio output instead.' }
        else { Write-Log 'Speaker unavailable after retries - not playing.'; Send-AgentStatus $cfg 'speaker-failed' "Could not connect '$($cfg.speakerName)'"; exit 2 }
    }

    # 5) Build what to play (validated URLs / files only)
    $targets = @()
    if ($S.MusicSource -eq 'songs') {
        $files = $null
        foreach ($song in $S.Songs) {
            if ($song.Kind -eq 'youtube') { $targets += $song.Url; continue }
            if ($null -eq $files) {   # index the local folder once: dashboard stores local songs by file name
                $files = @{}
                if ($cfg.localMusicDir -and (Test-Path $cfg.localMusicDir)) {
                    $ext = '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac'
                    Get-ChildItem -Path $cfg.localMusicDir -Recurse -File -ErrorAction SilentlyContinue |
                        Where-Object { $ext -contains $_.Extension.ToLower() } |
                        ForEach-Object { if (-not $files.ContainsKey($_.BaseName.ToLower())) { $files[$_.BaseName.ToLower()] = $_.FullName } }
                }
            }
            $hit = $files[$song.Title.ToLower()]
            if ($hit) { $targets += $hit } else { Write-Log "Local song '$($song.Title)' not found in localMusicDir - skipped." }
        }
    } elseif ($S.PlaylistUrl) { $targets += $S.PlaylistUrl }
    else { Write-Log 'No valid YouTube playlist URL in settings.' }

    # 6) Hold until the exact alarm time (the PC wakes a few minutes early)
    $wait = ($due - [datetime]::UtcNow).TotalSeconds
    if ($wait -gt 0 -and $wait -lt (([int]$cfg.wakeLeadMinutes + 10) * 60)) { Write-Log ("Waiting {0}s until alarm time" -f [int]$wait); Start-Sleep -Seconds ([int]$wait) }

    if (-not $Now) { $st = Get-AgentState; $st.lastPlayed = $due.ToString('o'); Save-AgentState $st }
    Send-AgentStatus $cfg 'playing' ("Alarm started at {0:HH:mm}" -f (Get-Date))

    $deadline = if ([int]$cfg.maxPlayMinutes -gt 0) { (Get-Date).AddMinutes([int]$cfg.maxPlayMinutes) } else { [datetime]::MaxValue }
    $played = $false

    if ($targets.Count -eq 0) {
        Invoke-FallbackBeep $cfg $mpv $device $S.Volume
    } else {
        Write-Log ("Playing {0} item(s), shuffle={1}, end={2}" -f $targets.Count, $S.Shuffle, $S.EndBehaviour)
        $loop = ($S.EndBehaviour -eq 'repeat')
        $r = Invoke-Mpv $cfg $mpv $ytdlp $targets $S.Shuffle $loop $S.FadeIn $S.Volume $device $deadline
        if ($r.FadeFailed) { $r = Invoke-Mpv $cfg $mpv $ytdlp $targets $S.Shuffle $loop $false $S.Volume $device $deadline }
        $played = ($r.Seconds -ge 20)

        if ($played -and $S.EndBehaviour -eq 'next' -and $S.NextPlaylistUrl -and (Get-Date) -lt $deadline) {
            Write-Log 'Switching to the next playlist.'
            [void](Invoke-Mpv $cfg $mpv $ytdlp @($S.NextPlaylistUrl) $S.Shuffle $false $false $S.Volume $device $deadline)
        }
        if (-not $played) {   # nothing played for 20 s: never leave the alarm silent
            Write-Log "Music did not play (mpv exit code $($r.ExitCode))."
            Invoke-FallbackBeep $cfg $mpv $device $S.Volume
        }
    }

    Write-Log 'Alarm finished.'
    Send-AgentStatus $cfg $(if ($played) { 'played' } else { 'error' }) $(if ($played) { "Played at {0:HH:mm}" -f (Get-Date) } else { 'Music failed to play; fallback beep used' })

    if ($cfg.sleepAfterPlayback -and -not $Now) {
        Write-Log 'Putting the PC back to sleep.'
        Start-Process rundll32.exe -ArgumentList 'powrprof.dll,SetSuspendState 0,1,0'
    }
} catch {
    Write-Log "Alarm failed: $($_.Exception.Message)"
    if ($cfg) { Send-AgentStatus $cfg 'error' $_.Exception.Message }
    exit 1
}