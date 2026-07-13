# DDOBuilder V2 oracle — CI orchestrator.
#
#   pwsh tools/v2-oracle/capture.ps1 -ExePath <DDOBuilder.exe> -AhkExe <AutoHotkey64.exe>
#       [-BuildsDir Output/FuzzBuilds] [-Limit 0]
#
# Runs capture.ahk for every *.DDOBuild in BuildsDir, writing
# fuzz-<seed>.v2export.txt next to each. Takes a desktop screenshot into
# tools/v2-oracle/shots/ whenever a capture fails, kills stray V2 processes
# between builds, and prints a summary. Exits 1 if any capture failed.

param(
    [Parameter(Mandatory)] [string]$ExePath,
    [Parameter(Mandatory)] [string]$AhkExe,
    [string]$BuildsDir = "Output/FuzzBuilds",
    [int]$Limit = 0,
    [int]$PerBuildTimeoutSec = 300
)

$ErrorActionPreference = "Continue"
$shotsDir = "tools/v2-oracle/shots"
New-Item -ItemType Directory -Force -Path $shotsDir | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
function Take-Screenshot([string]$path) {
    try {
        $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
        $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
        Write-Host "  screenshot -> $path"
    } catch {
        Write-Host "  screenshot failed: $_"
    }
}

$builds = Get-ChildItem -Path $BuildsDir -Filter *.DDOBuild | Sort-Object Name
if ($Limit -gt 0) { $builds = $builds | Select-Object -First $Limit }
Write-Host "Capturing $($builds.Count) build(s) with $ExePath"

$failed = @()
foreach ($b in $builds) {
    $out = Join-Path $b.DirectoryName ($b.BaseName + ".v2export.txt")
    $ahkLog = Join-Path $shotsDir ($b.BaseName + ".ahk.log")
    Write-Host "=== $($b.Name) ==="

    $p = Start-Process -FilePath $AhkExe `
        -ArgumentList @("`"$PSScriptRoot\capture.ahk`"", "`"$ExePath`"", "`"$($b.FullName)`"", "`"$out`"") `
        -RedirectStandardOutput $ahkLog -PassThru -NoNewWindow
    $done = $p.WaitForExit($PerBuildTimeoutSec * 1000)
    if (-not $done) {
        Write-Host "  TIMEOUT after ${PerBuildTimeoutSec}s"
        Take-Screenshot (Join-Path $shotsDir ($b.BaseName + ".timeout.png"))
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        $failed += $b.Name
    } elseif ($p.ExitCode -ne 0) {
        Write-Host "  FAILED exit=$($p.ExitCode)"
        Take-Screenshot (Join-Path $shotsDir ($b.BaseName + ".fail$($p.ExitCode).png"))
        $failed += $b.Name
    } elseif (-not (Test-Path $out) -or (Get-Item $out).Length -lt 100) {
        Write-Host "  FAILED: export file missing/near-empty"
        $failed += $b.Name
    } else {
        Write-Host "  ok: $((Get-Item $out).Length) bytes"
    }
    if (Test-Path $ahkLog) { Get-Content $ahkLog | ForEach-Object { Write-Host "  ahk| $_" } }

    # Kill any stray V2 instances before the next build.
    Get-Process -Name "DDOBuilder*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Captured $($builds.Count - $failed.Count)/$($builds.Count); failed: $($failed -join ', ')"
if ($failed.Count -gt 0) { exit 1 }
