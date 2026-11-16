<#
    GitHub Desktop 简体中文语言包 —— 安装入口（Windows PowerShell）

    用法：
        .\install.ps1                  # 安装到当前用户的最新版本
        .\install.ps1 -Uninstall       # 还原
        .\install.ps1 -Verify          # 只检查，不安装
        .\install.ps1 -Collect         # 开启漏译收集（用于补词条）

    说明：
        GitHub Desktop 用 Squirrel 更新，每次升级都会新建一个 app-X.Y.Z 目录，
        所以升级之后要重跑一次本脚本。脚本会自动挑最新的版本目录，不会装到旧版本上。
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Verify,
    [switch]$Collect,
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Node {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$node = Find-Node
if (-not $node) {
    Write-Host "[错误] 找不到 node.exe。" -ForegroundColor Red
    Write-Host "       本语言包的安装/还原脚本是用 Node 写的（GitHub Desktop 本身就是 Electron + Node，" 
    Write-Host "       但它的内置 Node 不能直接拿来跑脚本）。请先安装 Node.js：https://nodejs.org/"
    exit 1
}

if (-not $Root -and $env:LOCALAPPDATA) {
    $Root = Join-Path $env:LOCALAPPDATA "GitHubDesktop"
}

$scriptArgs = @()
if ($Root) { $scriptArgs += @("--root", $Root) }

if ($Uninstall) {
    Write-Host "== 还原 GitHub Desktop 中文语言包 ==" -ForegroundColor Cyan
    & $node (Join-Path $ProjectRoot "build\restore.js") @scriptArgs
    exit $LASTEXITCODE
}

if ($Verify) {
    Write-Host "== 校验 GitHub Desktop 中文语言包 ==" -ForegroundColor Cyan
    & $node (Join-Path $ProjectRoot "build\verify.js") @scriptArgs
    exit $LASTEXITCODE
}

if ($Collect) {
    Write-Host "== 开启漏译收集 ==" -ForegroundColor Cyan
    & $node (Join-Path $ProjectRoot "build\collect.js") @scriptArgs
    exit $LASTEXITCODE
}

Write-Host "== 安装 GitHub Desktop 中文语言包 ==" -ForegroundColor Cyan
& $node (Join-Path $ProjectRoot "build\apply.js") @scriptArgs
$code = $LASTEXITCODE

if ($code -eq 0) {
    Write-Host ""
    Write-Host "== 自检 ==" -ForegroundColor Cyan
    & $node (Join-Path $ProjectRoot "build\verify.js") @scriptArgs
    Write-Host ""
    Write-Host "提示：GitHub Desktop 正在运行时也能安装，但必须完全退出后重新打开才会生效。" -ForegroundColor Yellow
    Write-Host "      托盘图标也要退（右下角 → 右键 → Quit）。"
}

exit $code
