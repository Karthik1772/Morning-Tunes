# Sync-Agent.ps1 - runs every ~10 minutes (and at logon) as the "MorningAgent-Sync" task.
# Reads your dashboard settings and keeps ONE wake-from-sleep task ("MorningTunes-Alarm") in step with them.
. (Join-Path $PSScriptRoot 'Common.ps1')

try {
    $cfg = Get-AgentConfig
    $remote = $null
    try { $remote = Invoke-Dashboard $cfg } catch { Write-Log "Dashboard not reachable: $($_.Exception.Message)"; exit 0 }   # offline: keep the current schedule

    $S = $null
    if ($remote.settings) {
        try { $S = ConvertTo-SafeSettings $remote.settings } catch { Write-Log "Settings problem: $($_.Exception.Message)"; Send-AgentStatus $cfg 'error' $_.Exception.Message; exit 0 }
        ($remote.settings | ConvertTo-Json -Depth 8) | Set-Content -Path $CacheFile -Encoding UTF8
    }

    $want  = ($S -and $S.Enabled -and $S.PlayOn -eq 'agent' -and $S.Days.Count -gt 0)
    $state = Get-AgentState
    $exists = [bool](Get-ScheduledTask -TaskName $AlarmTaskName -ErrorAction SilentlyContinue)

    if ($want) {
        $lead = [int]$cfg.wakeLeadMinutes
        $plan = Get-WakePlan $S $lead
        $sig  = '{0}|{1}|{2}|{3}' -f $plan.Time.ToString('hh\:mm'), ($plan.Days -join ','), $lead, $cfg.maxPlayMinutes
        if (-not $exists -or $state.signature -ne $sig) {
            if (-not (Test-IsAdmin)) { throw 'Need administrator rights to (re)register the alarm task. Re-run Setup-Agent.ps1 as admin.' }
            $action   = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $AgentDir `
                          -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $AgentDir 'Play-Alarm.ps1'))
            $trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $plan.Days -At ([datetime]::Today.Add($plan.Time))
            $limit    = if ([int]$cfg.maxPlayMinutes -gt 0) { [int]$cfg.maxPlayMinutes + 20 } else { 600 }
            $settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                          -ExecutionTimeLimit (New-TimeSpan -Minutes $limit)
            $princ    = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
            Register-ScheduledTask -TaskName $AlarmTaskName -Action $action -Trigger $trigger -Settings $settings -Principal $princ -Force | Out-Null
            $state.signature = $sig
            Save-AgentState $state
            Write-Log ("Alarm task updated: wakes this PC at {0} on {1}" -f $plan.Time.ToString('hh\:mm'), ($plan.Days -join ','))
        }
        Send-AgentStatus $cfg 'idle' ("Armed. Next alarm {0}, PC wakes {1} min early" -f (Get-NextAlarmText $S), $lead)
    } else {
        if ($exists) {
            if (-not (Test-IsAdmin)) { throw 'Need administrator rights to remove the alarm task.' }
            Unregister-ScheduledTask -TaskName $AlarmTaskName -Confirm:$false
            $state.signature = ''; Save-AgentState $state
            Write-Log 'Alarm is off (or set to play in the browser): alarm task removed.'
        }
        $why = if (-not $S) { 'no settings saved yet' } elseif (-not $S.Enabled) { 'alarm is off' } elseif ($S.PlayOn -ne 'agent') { 'alarm plays in the browser' } else { 'no days selected' }
        Send-AgentStatus $cfg 'idle' "Not armed: $why"
    }
} catch {
    Write-Log "Sync failed: $($_.Exception.Message)"
    try { Send-AgentStatus (Get-AgentConfig) 'error' $_.Exception.Message } catch {}
    exit 1
}
