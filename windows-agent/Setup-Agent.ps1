#Requires -RunAsAdministrator
# Setup-Agent.ps1 - one-time setup (re-run any time; -Reconfigure asks the questions again).
param([switch]$Reconfigure)
. (Join-Path $PSScriptRoot 'Common.ps1')

Write-Host "`nMorningTunes Windows agent setup`n" -ForegroundColor Cyan

# 1) agent-config.json
if (-not (Test-Path $ConfigFile) -or $Reconfigure) {
    $c = Get-Content (Join-Path $AgentDir 'agent-config.example.json') -Raw | ConvertFrom-Json
    if (Test-Path $ConfigFile) { $c = Get-Content $ConfigFile -Raw | ConvertFrom-Json }
    $v = Read-Host "Your dashboard URL (e.g. https://morning-tunes.vercel.app) [$($c.dashboardUrl)]"; if ($v) { $c.dashboardUrl = $v.Trim().TrimEnd('/') }
    $v = Read-Host "Bluetooth speaker name exactly as Windows shows it [$($c.speakerName)]";        if ($v) { $c.speakerName = $v.Trim() }
    $v = Read-Host "Folder holding your local mp3s (optional) [$($c.localMusicDir)]";               if ($v) { $c.localMusicDir = $v.Trim() }
    $c | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
}
$cfg = Get-AgentConfig

# 2) passcode, stored encrypted for THIS Windows user only (DPAPI)
if (-not (Test-Path $PassFile) -or $Reconfigure) {
    $sec = Read-Host 'Sync passcode (the MORNINGTUNES_PASSCODE you set on Vercel)' -AsSecureString
    $sec | ConvertFrom-SecureString | Set-Content -Path $PassFile
}

# 3) tools
$mpv   = Resolve-Tool $cfg.mpvPath 'mpv'
$ytdlp = Resolve-Tool $cfg.ytdlpPath 'yt-dlp'
if (-not $mpv)   { Write-Host 'mpv is not installed.   Run: winget install mpv     then re-run this script.' -ForegroundColor Yellow }
if (-not $ytdlp) { Write-Host 'yt-dlp is not installed. Run: winget install yt-dlp  then re-run this script.' -ForegroundColor Yellow }
if ($mpv -or $ytdlp) {   # remember full paths: scheduled tasks may not have your interactive PATH
    $raw = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    if ($mpv)   { $raw.mpvPath = $mpv }
    if ($ytdlp) { $raw.ytdlpPath = $ytdlp }
    $raw | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
}
if ($mpv -and $cfg.speakerName) {
    if (Find-Speaker $mpv $cfg.speakerName) { Write-Host "Speaker '$($cfg.speakerName)' is connected and visible to mpv." -ForegroundColor Green }
    else { Write-Host "Speaker '$($cfg.speakerName)' is not visible right now (turn it on and connect it once). Devices mpv can see:" -ForegroundColor Yellow; Get-AudioDevices $mpv | Format-Table -AutoSize }
}

# 4) allow wake timers (AC + battery)
powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null

# 5) the 10-minute sync task
$user = "$env:USERDOMAIN\$env:USERNAME"
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $AgentDir `
             -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $AgentDir 'Sync-Agent.ps1'))
$t1 = New-ScheduledTaskTrigger -AtLogOn -User $user
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$princ = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $SyncTaskName -Action $action -Trigger @($t1, $t2) -Settings $settings -Principal $princ -Force | Out-Null
Write-Host "Registered '$SyncTaskName' (every 10 min + at logon)." -ForegroundColor Green

# 6) first sync right now
Write-Host "`nRunning the first sync..." -ForegroundColor Cyan
& (Join-Path $AgentDir 'Sync-Agent.ps1')

Write-Host "`nSleep states this PC supports:" -ForegroundColor Cyan
powercfg /a
Write-Host "`nNext: in the dashboard turn on Sync, set 'Play the alarm on' = Windows agent, and enable the alarm."
Write-Host "Test now with:  .\Play-Alarm.ps1 -Now"