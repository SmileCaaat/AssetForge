# AssetManagerTools — 从 GitHub 拉取最新代码并更新依赖
# 用法:
#   .\update.ps1              拉取当前分支更新
#   .\update.ps1 -Install     拉取后强制 npm install
#   .\update.ps1 -SkipProxy   不使用本地代理
#
# 代理: 默认尝试 http://127.0.0.1:7897 ；也可事先设置环境变量 HTTP_PROXY / HTTPS_PROXY

param(
    [switch]$Install,
    [switch]$SkipProxy
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Test-Command([string]$Name): bool {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-GitProxyArgs(): string[] {
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

function Needs-NpmInstall(): bool {
    param([string]$LockFile)
    if (-not (Test-Path $LockFile)) { return $false }
    $stamp = "$LockFile.updated"
    if (-not (Test-Path $stamp)) { return $true }
    return (Get-Item $LockFile).LastWriteTimeUtc -gt (Get-Item $stamp).LastWriteTimeUtc
}

function Mark-NpmInstalled([string]$LockFile) {
    Set-Content -Path "$LockFile.updated" -Value (Get-Date -Format "o") -Encoding UTF8
}

if (-not (Test-Command git)) {
    Write-Err "未找到 git，请先安装 Git: https://git-scm.com/download/win"
    exit 1
}

if (-not (Test-Path ".git")) {
    Write-Err "当前目录不是 Git 仓库。请先在项目根目录执行 git clone。"
    exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (-not $branch -or $branch -eq "HEAD") {
    Write-Err "无法识别当前分支。"
    exit 1
}

Write-Step "当前分支: $branch"

$dirty = git status --porcelain
if ($dirty) {
    Write-Warn "工作区有未提交修改（拉取可能失败或产生冲突）:"
    git status -sb
    Write-Host ""
    $answer = Read-Host "仍要继续拉取? [y/N]"
    if ($answer -notmatch '^[yY]') {
        Write-Step "已取消。"
        exit 0
    }
}

try {
    Write-Step "正在 fetch origin..."
    Invoke-Git fetch origin $branch

    $localRev = (git rev-parse HEAD).Trim()
    $remoteRev = (git rev-parse "origin/$branch" 2>$null).Trim()
    if (-not $remoteRev) {
        throw "远程分支 origin/$branch 不存在。"
    }

    if ($localRev -eq $remoteRev) {
        Write-Ok "已是最新版本 ($($localRev.Substring(0, 7)))。"
    } else {
        Write-Step "正在 pull origin/$branch ..."
        Invoke-Git pull --ff-only origin $branch
        $newRev = (git rev-parse HEAD).Trim()
        Write-Ok "代码已更新: $($localRev.Substring(0, 7)) -> $($newRev.Substring(0, 7))"
        git log -1 --oneline
    }
} catch {
    Write-Err $_.Exception.Message
    Write-Warn "若网络不通，可设置代理后重试，例如:"
    Write-Host '  $env:HTTP_PROXY="http://127.0.0.1:7897"; $env:HTTPS_PROXY="http://127.0.0.1:7897"; .\update.ps1'
    exit 1
}

$rootLockChanged = $false
$clientLockChanged = $false
if ($localRev -ne $remoteRev) {
    $changedFiles = @(git diff --name-only "HEAD@{1}" HEAD 2>$null)
    $rootLockChanged = ($changedFiles -contains "package-lock.json") -or ($changedFiles -contains "package.json")
    $clientLockChanged = ($changedFiles -contains "client/package-lock.json") -or ($changedFiles -contains "client/package.json")
}

$shouldInstallRoot = $Install -or $rootLockChanged -or (Needs-NpmInstall "package-lock.json")
$shouldInstallClient = $Install -or $clientLockChanged -or (Needs-NpmInstall "client/package-lock.json")

if (-not (Test-Command npm)) {
    Write-Warn "未找到 npm，跳过依赖安装。"
    exit 0
}

if ($shouldInstallRoot) {
    Write-Step "正在安装后端依赖 (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Mark-NpmInstalled "package-lock.json"
}

if ($shouldInstallClient) {
    Write-Step "正在安装前端依赖 (client/npm install)..."
    Push-Location client
    npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { exit $code }
    Mark-NpmInstalled "client/package-lock.json"
}

if ($shouldInstallRoot -or $shouldInstallClient) {
    Write-Ok "依赖已更新。"
} else {
    Write-Ok "依赖无需重装。"
}

Write-Host ""
Write-Ok "完成。可运行 start.bat 或 .\start.ps1 启动应用。"
