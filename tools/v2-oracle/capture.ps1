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
    [int]$PerBuildTimeoutSec = 900
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

# MotW on the downloaded exe makes ShellExecute block on a consent dialog —
# strip it and launch via CreateProcess (Start-Process on an .exe) instead.
$exeFull = (Resolve-Path $ExePath).Path
$exeDir = Split-Path $exeFull
Get-ChildItem $exeDir -Include *.exe, *.dll -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

$builds = Get-ChildItem -Path $BuildsDir -Filter *.DDOBuild | Sort-Object Name
if ($Limit -gt 0) { $builds = $builds | Select-Object -First $Limit }
# Control first: a V2-AUTHORED file. If it captures while fuzz builds fail,
# the exporter's file fidelity is the problem; if both fail, the environment is.
$control = Get-Item "Output/Example Builds/YingsMonk.DDOBuild" -ErrorAction SilentlyContinue
if ($control) { $builds = @($control) + @($builds) }
Write-Host "Capturing $($builds.Count) build(s) with $ExePath"

$failed = @()
foreach ($b in $builds) {
    $out = Join-Path $b.DirectoryName ($b.BaseName + ".v2export.txt")
    $ahkLog = Join-Path $shotsDir ($b.BaseName + ".ahk.log")
    Write-Host "=== $($b.Name) ==="

    # Launch V2 ourselves (CreateProcess — no ShellExecute consent dialog).
    $v2 = Start-Process -FilePath $exeFull -ArgumentList "`"$($b.FullName)`"" `
        -WorkingDirectory $exeDir -PassThru
    Write-Host "  v2 pid=$($v2.Id)"

    # /ErrorStdOut: AHK script errors print to stdout instead of a blocking dialog.
    $p = Start-Process -FilePath $AhkExe `
        -ArgumentList @("/ErrorStdOut", "`"$PSScriptRoot\capture.ahk`"", "$($v2.Id)", "`"$out`"") `
        -RedirectStandardOutput $ahkLog -PassThru -NoNewWindow
    $done = $p.WaitForExit($PerBuildTimeoutSec * 1000)
    if (-not $done) {
        Write-Host "  TIMEOUT after ${PerBuildTimeoutSec}s"
        Get-Process -Name "DDOBuilder*" -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "  proc: $($_.ProcessName) pid=$($_.Id) title='$($_.MainWindowTitle)'" }
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
    # The AHK's own flushed log (survives kills) supersedes the stdout copy.
    $flushedLog = "$out.log"
    if (Test-Path $flushedLog) { Copy-Item $flushedLog $ahkLog -Force }
    if (Test-Path $ahkLog) { Get-Content $ahkLog | ForEach-Object { Write-Host "  ahk| $_" } }

    # Kill any stray V2 instances before the next build.
    Get-Process -Name "DDOBuilder*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Captured $($builds.Count - $failed.Count)/$($builds.Count); failed: $($failed -join ', ')"
if ($failed.Count -gt 0) { exit 1 }
