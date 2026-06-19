# AssetForge - stop running dev servers
# Kills whatever is listening on the API (3456) and frontend (5173) ports.
# Useful when an AI coding session left servers running in the background.
#
# Usage:
#   .\stop.ps1            stop default ports (3456, 5173)
#   .\stop.ps1 -Ports 3456,5173,4000   stop a custom port list
#   .\stop.ps1 -Quiet     no prompts, exit immediately

param(
    [int[]]$Ports = @(3456, 5173),
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-PortPids {
    param([int]$Port)

    $pids = @()

    # Preferred: Get-NetTCPConnection (Windows 8+/Server 2012+)
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
            if ($conns) { $pids += $conns.OwningProcess }
        } catch {
            # fall through to netstat
        }
    }

    # Fallback: parse netstat output
    if ($pids.Count -eq 0) {
        $lines = netstat -ano | Select-String ":$Port\s"
        foreach ($line in $lines) {
            $parts = ($line.ToString().Trim() -split "\s+")
            if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
                $pids += [int]$parts[4]
            }
        }
    }

    return $pids | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique
}

$killed = 0

foreach ($port in $Ports) {
    $pids = Get-PortPids -Port $port
    if (-not $pids -or $pids.Count -eq 0) {
        Write-Host "[skip] port $port - nothing listening" -ForegroundColor DarkGray
        continue
    }

    foreach ($processId in $pids) {
        try {
            $proc = Get-Process -Id $processId -ErrorAction Stop
            $name = $proc.ProcessName
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "[kill] port $port -> PID $processId ($name)" -ForegroundColor Green
            $killed++
        } catch {
            Write-Host "[warn] port $port -> PID $processId could not be stopped: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
if ($killed -gt 0) {
    Write-Host "Done. Stopped $killed process(es)." -ForegroundColor Cyan
} else {
    Write-Host "Done. No matching servers were running." -ForegroundColor Cyan
}

if (-not $Quiet) {
    Read-Host "Press Enter to exit"
}
