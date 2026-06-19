param(
    [switch]$Debug
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location $PSScriptRoot

$debugOn = $Debug -or ($env:DEBUG -eq "1") -or ($env:DEBUG -eq "true")
if ($debugOn) {
    $env:DEBUG = "1"
    $env:VITE_DEBUG = "1"
    Write-Host "[DEBUG] Debug logging enabled (server + browser console)" -ForegroundColor Yellow
    Write-Host "        Server: [DEBUG:project.*] in this window" -ForegroundColor DarkYellow
    Write-Host "        Client: [AMT DEBUG:*] in browser DevTools console" -ForegroundColor DarkYellow
}

if (-not (Test-Path "AssetManager.lnk")) {
    try {
        & "$PSScriptRoot\create-launcher.ps1" -Silent | Out-Null
    } catch {
        # Non-fatal: continue with start.bat if shortcut creation fails
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 Node.js，请先安装: https://nodejs.org/" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 npm，请确认 Node.js 安装完整。" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

$hasRootDeps = Test-Path "node_modules"
$hasClientDeps = Test-Path "client\node_modules"

if (-not $hasRootDeps) {
    if (-not $hasClientDeps) {
        Write-Host "[首次运行] 正在安装全部依赖（后端 + 前端），请稍候..." -ForegroundColor Cyan
    } else {
        Write-Host "[安装] 正在安装后端依赖..." -ForegroundColor Cyan
    }
    npm run setup
} elseif (-not $hasClientDeps) {
    Write-Host "[安装] 正在安装前端依赖..." -ForegroundColor Cyan
    Push-Location client
    npm install
    Pop-Location
}

Write-Host ""
Write-Host "========================================"
Write-Host "  AssetForge 资产锻造坊 启动中..."
Write-Host "  前端: http://localhost:5173"
Write-Host "  API:  http://localhost:3456"
if ($debugOn) {
    Write-Host "  模式: DEBUG"
}
Write-Host "========================================"
Write-Host ""
Write-Host "关闭此窗口将停止服务。"
if (-not $debugOn) {
    Write-Host "调试: .\start.ps1 -Debug  或  set DEBUG=1 后运行 start.bat"
}
Write-Host ""

Start-Job {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:5173"
} | Out-Null

npm run dev

Read-Host "按 Enter 退出"
