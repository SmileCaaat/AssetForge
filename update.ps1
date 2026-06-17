# AssetManagerTools - git pull and npm install
#
# Usage:
#   .\update.ps1
#   .\update.ps1 -Install
#   .\update.ps1 -SkipProxy
#
# Proxy: default http://127.0.0.1:7897, or set HTTP_PROXY / HTTPS_PROXY

param(
    [switch]$Install,
    [switch]$SkipProxy
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Write-Step([string]$Message) {
    Write-Host "[update] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[update] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[update] $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "[update] $Message" -ForegroundColor Red
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-GitProxyArgs() {
    if ($SkipProxy) { return @() }

    $proxy = $env:HTTPS_PROXY
    if (-not $proxy) { $proxy = $env:HTTP_PROXY }
    if (-not $proxy) { $proxy = "http://127.0.0.1:7897" }

    return @("-c", "http.proxy=$proxy", "-c", "https.proxy=$proxy")
}

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $proxyArgs = Get-GitProxyArgs
    & git @proxyArgs @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed (exit $LASTEXITCODE)"
    }
}

function Test-NeedsNpmInstall([string]$LockFile) {
    if (-not (Test-Path $LockFile)) { return $false }
    $stamp = "$LockFile.updated"
    if (-not (Test-Path $stamp)) { return $true }
    return (Get-Item $LockFile).LastWriteTimeUtc -gt (Get-Item $stamp).LastWriteTimeUtc
}

function Set-NpmInstalledStamp([string]$LockFile) {
    Set-Content -Path "$LockFile.updated" -Value (Get-Date -Format "o") -NoNewline
}

if (-not (Test-Command git)) {
    Write-Err "Git not found. Install from https://git-scm.com/download/win"
    exit 1
}

if (-not (Test-Path ".git")) {
    Write-Err "Not a git repository. Run git clone in the project root first."
    exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (-not $branch -or $branch -eq "HEAD") {
    Write-Err "Cannot detect current branch."
    exit 1
}

Write-Step "Branch: $branch"

$dirty = git status --porcelain
if ($dirty) {
    Write-Warn "Working tree has uncommitted changes (pull may fail or conflict):"
    git status -sb
    Write-Host ""
    $answer = Read-Host "Continue anyway? [y/N]"
    if ($answer -notmatch '^[yY]') {
        Write-Step "Cancelled."
        exit 0
    }
}

$localRev = ""
$remoteRev = ""
$pulled = $false

try {
    Write-Step "Fetching origin..."
    Invoke-Git fetch origin $branch

    $localRev = (git rev-parse HEAD).Trim()
    $remoteRev = (git rev-parse "origin/$branch" 2>$null).Trim()
    if (-not $remoteRev) {
        throw "Remote branch origin/$branch does not exist."
    }

    if ($localRev -eq $remoteRev) {
        Write-Ok "Already up to date ($($localRev.Substring(0, 7)))."
    } else {
        Write-Step "Pulling origin/$branch ..."
        Invoke-Git pull --ff-only origin $branch
        $pulled = $true
        $newRev = (git rev-parse HEAD).Trim()
        Write-Ok "Updated: $($localRev.Substring(0, 7)) -> $($newRev.Substring(0, 7))"
        git log -1 --oneline
        $localRev = $newRev
    }
} catch {
    Write-Err $_.Exception.Message
    Write-Warn "If the network failed, set a proxy and retry, e.g.:"
    Write-Host '  $env:HTTP_PROXY="http://127.0.0.1:7897"; $env:HTTPS_PROXY="http://127.0.0.1:7897"; .\update.ps1'
    exit 1
}

$rootLockChanged = $false
$clientLockChanged = $false
if ($pulled) {
    $changedFiles = @(git diff --name-only "HEAD@{1}" HEAD 2>$null)
    $rootLockChanged = ($changedFiles -contains "package-lock.json") -or ($changedFiles -contains "package.json")
    $clientLockChanged = ($changedFiles -contains "client/package-lock.json") -or ($changedFiles -contains "client/package.json")
}

$shouldInstallRoot = $Install -or $rootLockChanged -or (Test-NeedsNpmInstall "package-lock.json")
$shouldInstallClient = $Install -or $clientLockChanged -or (Test-NeedsNpmInstall "client/package-lock.json")

if (-not (Test-Command npm)) {
    Write-Warn "npm not found. Skipping dependency install."
    exit 0
}

if ($shouldInstallRoot) {
    Write-Step "Installing root dependencies (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Set-NpmInstalledStamp "package-lock.json"
}

if ($shouldInstallClient) {
    Write-Step "Installing client dependencies (npm install)..."
    Push-Location client
    npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { exit $code }
    Set-NpmInstalledStamp "client/package-lock.json"
}

if ($shouldInstallRoot -or $shouldInstallClient) {
    Write-Ok "Dependencies updated."
} else {
    Write-Ok "Dependencies unchanged."
}

Write-Host ""
Write-Ok "Done. Run start.bat or .\start.ps1 to launch."
