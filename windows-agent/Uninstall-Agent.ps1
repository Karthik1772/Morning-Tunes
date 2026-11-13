#Requires -RunAsAdministrator
# Removes both scheduled tasks. Your files and settings are left in place.
. (Join-Path $PSScriptRoot 'Common.ps1')
foreach ($n in @($AlarmTaskName, $SyncTaskName)) {
    if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; Write-Host "Removed $n" }
}
