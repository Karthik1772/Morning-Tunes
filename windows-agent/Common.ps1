# Common.ps1 - shared helpers. Dot-sourced by Setup-Agent / Sync-Agent / Play-Alarm.
# Compatible with Windows PowerShell 5.1 and PowerShell 7.
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$AgentDir      = $PSScriptRoot
$LogFile       = Join-Path $AgentDir 'agent.log'
$StateFile     = Join-Path $AgentDir 'agent-state.json'
$CacheFile     = Join-Path $AgentDir 'settings.cache.json'
$PassFile      = Join-Path $AgentDir 'passcode.sec'
$ConfigFile    = Join-Path $AgentDir 'agent-config.json'
$AlarmTaskName = 'MorningTunes-Alarm'
$SyncTaskName  = 'MorningAgent-Sync'
$GraceMinutes  = 10   # same late-start grace as the dashboard's browser alarm

# The dashboard's timezone dropdown uses IANA names; Windows PowerShell 5.1 needs Windows ids.
$TzMap = @{
    'Asia/Kolkata'     = 'India Standard Time'
    'UTC'              = 'UTC'
    'America/New_York' = 'Eastern Standard Time'
    'Europe/London'    = 'GMT Standard Time'
    'Asia/Singapore'   = 'Singapore Standard Time'
}

function Write-Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message
    try {
        if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 1MB)) { Move-Item $LogFile "$LogFile.old" -Force }
        Add-Content -Path $LogFile -Value $line
    } catch {}
    Write-Host $line
}

function Test-IsAdmin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------------------------------------------------------------- config / secrets
function Get-AgentConfig {
    if (-not (Test-Path $ConfigFile)) { throw 'agent-config.json not found. Run Setup-Agent.ps1 first.' }
    $c = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    $url = ([string]$c.dashboardUrl).Trim().TrimEnd('/')
    if (($url -notmatch '^https://[A-Za-z0-9.-]+(:\d+)?$') -and ($url -notmatch '^http://localhost(:\d+)?$')) {
        throw "dashboardUrl must look like https://your-app.vercel.app (got '$url')."
    }
    if ($url -match 'YOUR-APP') { throw 'Set dashboardUrl in agent-config.json to your real Vercel address (re-run Setup-Agent.ps1 -Reconfigure).' }
    $c.dashboardUrl = $url
    $defaults = [ordered]@{
        wakeLeadMinutes = 3; maxPlayMinutes = 60; connectRetries = 6; retryDelaySeconds = 10
        fallbackBeepMinutes = 5; fallbackToDefaultOutput = $false; sleepAfterPlayback = $false
        speakerName = ''; localMusicDir = ''; mpvPath = ''; ytdlpPath = ''
    }
    foreach ($k in $defaults.Keys) {
        if (-not $c.PSObject.Properties[$k]) { $c | Add-Member -NotePropertyName $k -NotePropertyValue $defaults[$k] }
    }
    $c
}

function Get-Passcode {
    if (-not (Test-Path $PassFile)) { throw 'passcode.sec not found. Run Setup-Agent.ps1 first.' }
    # DPAPI-protected: only this Windows user on this PC can decrypt it.
    $sec = Get-Content $PassFile | ConvertTo-SecureString
    [System.Net.NetworkCredential]::new('', $sec).Password
}

# ---------------------------------------------------------------- dashboard API
function Invoke-Dashboard($Cfg, [string]$Method = 'GET', $Body = $null) {
    $req = @{
        Uri             = "$($Cfg.dashboardUrl)/api/settings"
        Method          = $Method
        Headers         = @{ 'x-passcode' = (Get-Passcode) }
        TimeoutSec      = 25
        UseBasicParsing = $true
    }
    if ($null -ne $Body) { $req.Body = ($Body | ConvertTo-Json -Compress); $req.ContentType = 'application/json' }
    Invoke-RestMethod @req
}

function Send-AgentStatus($Cfg, [string]$State, [string]$Detail) {
    try { Invoke-Dashboard $Cfg 'POST' @{ source = 'agent'; state = $State; detail = $Detail } | Out-Null }
    catch { Write-Log "Could not report status to the dashboard: $($_.Exception.Message)" }
}

# Returns @{ Raw; FromCache } or $null. Falls back to the last good copy when offline.
function Get-RemoteSettings($Cfg) {
    try {
        $r = Invoke-Dashboard $Cfg
        if ($null -ne $r.settings) { ($r.settings | ConvertTo-Json -Depth 8) | Set-Content -Path $CacheFile -Encoding UTF8 }
        return [pscustomobject]@{ Raw = $r.settings; FromCache = $false }
    } catch {
        Write-Log "Could not fetch settings: $($_.Exception.Message)"
        if (Test-Path $CacheFile) {
            Write-Log 'Using the cached copy of the last good settings.'
            return [pscustomobject]@{ Raw = (Get-Content $CacheFile -Raw | ConvertFrom-Json); FromCache = $true }
        }
        return $null
    }
}

function Wait-Internet([int]$TimeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try { [void][System.Net.Dns]::GetHostAddresses('www.youtube.com'); return $true } catch { Start-Sleep -Seconds 3 }
    }
    return $false
}

# ---------------------------------------------------------------- settings validation
# Mirrors normalizeSettings() in src/lib/types.ts. Everything that later reaches mpv is rebuilt
# from validated IDs, so nothing from the web can inject options or arbitrary URLs/paths.
function Get-PlaylistUrl([string]$Url) {
    if ($Url -match '[?&]list=([A-Za-z0-9_-]{10,64})') { return "https://www.youtube.com/playlist?list=$($Matches[1])" }
    return $null
}

function ConvertTo-SafeSettings($Raw) {
    if ($null -eq $Raw) { return $null }

    if ([string]$Raw.alarmTime -match '^([01]\d|2[0-3]):([0-5]\d)$') { $hour = [int]$Matches[1]; $minute = [int]$Matches[2] }
    else { throw "Invalid alarm time '$($Raw.alarmTime)'" }

    $tzName = [string]$Raw.timezone
    $tzId = if ($TzMap.ContainsKey($tzName)) { $TzMap[$tzName] } else { $tzName }
    $tz = $null
    try { $tz = [TimeZoneInfo]::FindSystemTimeZoneById($tzId) } catch {}
    if (-not $tz) { throw "Unsupported timezone '$tzName'. Pick one of the five in the dashboard dropdown." }

    switch ([string]$Raw.schedule) {
        'weekdays' { $days = @(1..5) }
        'weekends' { $days = @(0, 6) }
        'custom'   {
            $days = @()
            foreach ($d in @($Raw.customDays)) { try { $n = [int]$d; if ($n -ge 0 -and $n -le 6) { $days += $n } } catch {} }
            $days = @($days | Sort-Object -Unique)
        }
        default    { $days = @(0..6) }
    }

    $songs = @()
    foreach ($s in @($Raw.songs)) {
        if ($s.kind -eq 'local') { $songs += [pscustomobject]@{ Kind = 'local'; Title = ([string]$s.title) } }
        elseif ([string]$s.videoId -match '^[A-Za-z0-9_-]{11}$') {
            $songs += [pscustomobject]@{ Kind = 'youtube'; Url = "https://www.youtube.com/watch?v=$($s.videoId)" }
        }
    }

    $vol = 70; try { $vol = [int][Math]::Round([Math]::Min(100, [Math]::Max(0, [double]$Raw.volume))) } catch {}
    $end = [string]$Raw.endBehaviour; if (@('stop', 'repeat', 'next') -notcontains $end) { $end = 'stop' }

    [pscustomobject]@{
        Enabled         = ($Raw.enabled -eq $true)
        PlayOn          = $(if ($Raw.playOn -eq 'agent') { 'agent' } else { 'browser' })
        Hour            = $hour
        Minute          = $minute
        TimeZone        = $tz
        TimeZoneName    = $tzName
        Days            = $days
        MusicSource     = $(if ($Raw.musicSource -eq 'songs') { 'songs' } else { 'playlist' })
        PlaylistUrl     = (Get-PlaylistUrl ([string]$Raw.playlistUrl))
        NextPlaylistUrl = (Get-PlaylistUrl ([string]$Raw.nextPlaylistUrl))
        Songs           = $songs
        EndBehaviour    = $end
        Shuffle         = ($Raw.shuffle -eq $true)
        FadeIn          = ($Raw.fadeIn -eq $true)
        Volume          = $vol
    }
}

# ---------------------------------------------------------------- alarm times
# UTC instants of the alarm on the calendar days [From..To] relative to "today" in the alarm's own timezone.
function Get-AlarmInstants($S, [datetime]$NowUtc, [int]$From, [int]$To) {
    $tz = $S.TimeZone
    $nowZ = [TimeZoneInfo]::ConvertTimeFromUtc($NowUtc, $tz)
    $out = @()
    foreach ($offset in $From..$To) {
        $d = $nowZ.Date.AddDays($offset)
        if ($S.Days -notcontains [int]$d.DayOfWeek) { continue }          # 0 = Sunday, same as the dashboard
        $local = [datetime]::SpecifyKind($d.AddHours($S.Hour).AddMinutes($S.Minute), [DateTimeKind]::Unspecified)
        if ($tz.IsInvalidTime($local)) { $local = $local.AddHours(1) }     # DST gap
        $out += [TimeZoneInfo]::ConvertTimeToUtc($local, $tz)
    }
    $out
}

# The alarm that should be sounding about now (waking up to `LeadMinutes` early, up to GraceMinutes late).
function Find-DueAlarm($S, [int]$LeadMinutes) {
    $now = [datetime]::UtcNow
    Get-AlarmInstants $S $now -1 1 |
        Where-Object { $_ -le $now.AddMinutes($LeadMinutes + 10) -and $_ -ge $now.AddMinutes(-$GraceMinutes) } |
        Sort-Object | Select-Object -First 1
}

# Weekly wake schedule in THIS PC's local time (so alarms in another timezone still work).
function Get-WakePlan($S, [int]$LeadMinutes) {
    $wakes = @()
    foreach ($utc in (Get-AlarmInstants $S ([datetime]::UtcNow) 0 6)) {   # 7 consecutive days = every weekday once
        $wakes += [TimeZoneInfo]::ConvertTimeFromUtc($utc.AddMinutes(-$LeadMinutes), [TimeZoneInfo]::Local)
    }
    if (-not $wakes) { return $null }
    $tod  = $wakes[0].TimeOfDay        # if DST makes one day differ, the next sync (10 min) corrects it
    $days = @($wakes | Where-Object { $_.TimeOfDay -eq $tod } | ForEach-Object { $_.DayOfWeek } | Sort-Object -Unique)
    [pscustomobject]@{ Time = $tod; Days = $days }
}

function Get-NextAlarmText($S) {
    $now = [datetime]::UtcNow
    $next = Get-AlarmInstants $S $now -1 8 | Where-Object { $_ -ge $now.AddMinutes(-$GraceMinutes) } | Sort-Object | Select-Object -First 1
    if (-not $next) { return 'no upcoming alarm' }
    '{0:ddd HH:mm}' -f [TimeZoneInfo]::ConvertTimeFromUtc($next, [TimeZoneInfo]::Local)
}

# ---------------------------------------------------------------- state
function Get-AgentState {
    if (Test-Path $StateFile) { try { return (Get-Content $StateFile -Raw | ConvertFrom-Json) } catch {} }
    [pscustomobject]@{ signature = ''; lastPlayed = '' }
}
function Save-AgentState($State) { ($State | ConvertTo-Json) | Set-Content -Path $StateFile -Encoding UTF8 }

# ---------------------------------------------------------------- tools, speaker, mpv
function Resolve-Tool([string]$Configured, [string]$Name) {
    if ($Configured -and (Test-Path $Configured)) { return (Resolve-Path $Configured).Path }
    $c = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.Source }
    return $null
}

function Get-AudioDevices([string]$Mpv) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # native stderr must not become a terminating error in PS 5.1
    try { $out = & $Mpv '--audio-device=help' 2>&1 | Out-String } finally { $ErrorActionPreference = $prev }
    foreach ($l in ($out -split "`r?`n")) {
        if ($l -match "^\s*'([^']+)'\s*\((.*)\)\s*$") { [pscustomobject]@{ Id = $Matches[1]; Name = $Matches[2] } }
    }
}

# mpv lists only ACTIVE WASAPI endpoints, so a disconnected Bluetooth speaker is simply absent.
function Find-Speaker([string]$Mpv, [string]$Name) {
    if (-not $Name) { return $null }
    Get-AudioDevices $Mpv | Where-Object { $_.Id -like 'wasapi/*' -and $_.Name -like "*$Name*" } | Select-Object -First 1
}

function Connect-Speaker($Cfg, [string]$Mpv) {
    $dev = Find-Speaker $Mpv $Cfg.speakerName
    if ($dev) { Write-Log "Speaker already connected: $($dev.Name)"; return $dev }
    for ($i = 1; $i -le [int]$Cfg.connectRetries; $i++) {
        Write-Log "Speaker not available - reconnect attempt $i of $($Cfg.connectRetries)"
        try {
            # Windows has no 'connect' command. Disabling/enabling the paired device makes it reconnect
            # when the speaker is on and in range (needs the admin rights this task runs with).
            $pnp = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like "*$($Cfg.speakerName)*" }
            foreach ($d in $pnp) {
                Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                Enable-PnpDevice  -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
            }
        } catch { Write-Log "Reconnect error: $($_.Exception.Message)" }
        Start-Sleep -Seconds ([int]$Cfg.retryDelaySeconds)
        $dev = Find-Speaker $Mpv $Cfg.speakerName
        if ($dev) { Write-Log "Speaker connected: $($dev.Name)"; return $dev }
    }
    return $null
}

function Quote-Arg([string]$s) {
    if ($null -eq $s) { return '""' }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    $slashes = 0
    foreach ($ch in $s.ToCharArray()) {
        if ($ch -eq [char]92) { $slashes++; continue }
        if ($ch -eq [char]34) {
            [void]$sb.Append(('\' * (2 * $slashes + 1)))
            [void]$sb.Append('"')
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) { [void]$sb.Append(('\' * $slashes)); $slashes = 0 }
        [void]$sb.Append($ch)
    }
    if ($slashes -gt 0) { [void]$sb.Append(('\' * (2 * $slashes))) }
    [void]$sb.Append('"')
    $sb.ToString()
}

# Sets mpv's volume over its IPC pipe (used for the one-time fade-in). Returns $true on success.
function Set-MpvVolume([string]$Pipe, [int]$Value) {
    try {
        $c = New-Object System.IO.Pipes.NamedPipeClientStream('.', $Pipe, [System.IO.Pipes.PipeDirection]::Out)
        $c.Connect(300)
        $w = New-Object System.IO.StreamWriter($c)
        $w.AutoFlush = $true
        $w.WriteLine('{"command":["set_property","volume",' + $Value + ']}')
        $w.Dispose(); $c.Dispose()
        return $true
    } catch { return $false }
}

# Plays `Targets` (already-validated YouTube URLs / local file paths) until finished or Deadline.
# Returns @{ ExitCode; Seconds; FadeFailed }.
function Invoke-Mpv($Cfg, [string]$Mpv, [string]$Ytdlp, [string[]]$Targets, [bool]$Shuffle, [bool]$Loop, [bool]$Fade, [int]$Volume, $Device, [datetime]$Deadline) {
    $pipe = "morningtunes-$PID"
    $startVol = if ($Fade) { 0 } else { $Volume }
    $mpvLog = Join-Path $AgentDir 'mpv-last.log'
    $a = @('--no-video', '--no-terminal', '--really-quiet', "--volume=$startVol", "--input-ipc-server=\\.\pipe\$pipe", "--log-file=$mpvLog", '--ytdl-format=bestaudio/best')
    if ($Device)  { $a += "--audio-device=$($Device.Id)" }
    if ($Shuffle) { $a += '--shuffle' }
    if ($Loop)    { $a += '--loop-playlist=inf' }
    if ($Ytdlp)   { $a += (Quote-Arg "--script-opts=ytdl_hook-ytdl_path=$Ytdlp") }
    $a += '--'
    foreach ($t in $Targets) { $a += (Quote-Arg $t) }

    Write-Log ("Launching mpv with {0} target(s); diagnostic log: {1}" -f $Targets.Count, $mpvLog)
    $proc = Start-Process -FilePath $Mpv -ArgumentList ($a -join ' ') -PassThru -WindowStyle Hidden
    $t0 = Get-Date; $ramp = 0; $rampStarted = $false; $lastStep = Get-Date; $fadeFailed = $false
    while (-not $proc.HasExited) {
        if ((Get-Date) -ge $Deadline) { Write-Log 'Time limit reached - stopping.'; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; break }
        if ($Fade -and $ramp -lt $Volume -and ((Get-Date) - $lastStep).TotalSeconds -ge 1.2) {
            # same shape as the dashboard: +5% every 1.2 s until the target volume
            if (Set-MpvVolume $pipe ([Math]::Min($Volume, $ramp + 5))) { $ramp = [Math]::Min($Volume, $ramp + 5); $rampStarted = $true }
            $lastStep = Get-Date
        }
        if ($Fade -and $Volume -gt 0 -and -not $rampStarted -and ((Get-Date) - $t0).TotalSeconds -gt 12) {
            # Safety: started at 0% but cannot raise it -> restart without fade rather than stay silent.
            Write-Log 'Could not control mpv volume - restarting without fade-in.'
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; $fadeFailed = $true; break
        }
        Start-Sleep -Milliseconds 300
    }
    $code = 0; try { $proc.WaitForExit(2000) | Out-Null; $code = $proc.ExitCode } catch {}
    [pscustomobject]@{ ExitCode = $code; Seconds = ((Get-Date) - $t0).TotalSeconds; FadeFailed = $fadeFailed }
}

# Never silent: a repeating beep through the speaker.
function Invoke-FallbackBeep($Cfg, [string]$Mpv, $Device, [int]$Volume) {
    $minutes = [int]$Cfg.fallbackBeepMinutes
    if ($minutes -le 0) { return }
    Write-Log "Playing fallback beep for up to $minutes min."
    $a = @('--no-video', '--no-terminal', '--really-quiet', "--volume=$([Math]::Max(30, $Volume))", "--length=$($minutes * 60)")
    if ($Device) { $a += "--audio-device=$($Device.Id)" }
    $a += 'av://lavfi:sine=frequency=880:beep_factor=4'
    $p = Start-Process -FilePath $Mpv -ArgumentList $a -PassThru -WindowStyle Hidden
    [void]$p.WaitForExit(($minutes * 60 + 15) * 1000)
}
