# Builds the customer package: dist\EmailBlaster\ plus dist\EmailBlaster-Setup-<ver>.exe
#
# Usage (from the repo root):
#   npm run package:win
#   npm run package:win -- -SkipInstaller      (folder only, no .exe setup)
#
# Node and Inno Setup are auto-detected. Override them only if needed:
#   npm run package:win -- -NodeDir "C:\node-v22.11.0-win-x64" -InnoSetup "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

param(
    [string]$NodeDir = "",
    [string]$OutDir = "dist",
    [string]$AppName = "EmailBlaster",
    [string]$InnoSetup = "",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

# Draws installer\app.ico the first time only. Returns $true on success.
function New-AppIcon {
    param([string]$Path)
    try {
        Add-Type -AssemblyName System.Drawing
        $size = 256
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 41, 59))
        $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
        $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $g.FillRectangle($bg, 0, 0, $size, $size)
        $g.FillRectangle($accent, 0, 190, $size, 66)
        $font = New-Object System.Drawing.Font("Segoe UI", 118, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $fmt = New-Object System.Drawing.StringFormat
        $fmt.Alignment = [System.Drawing.StringAlignment]::Center
        $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString("EB", $font, $white, (New-Object System.Drawing.RectangleF(0, 0, $size, 188)), $fmt)
        $g.Dispose()

        $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
        $stream = [System.IO.File]::Create($Path)
        $icon.Save($stream)
        $stream.Close()
        $bmp.Dispose()
        return $true
    } catch {
        Write-Warning "Could not generate app icon: $($_.Exception.Message)"
        return $false
    }
}

# Locates ISCC.exe (Inno Setup compiler) without hard-coded user paths.
function Find-Iscc {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 7\ISCC.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 5\ISCC.exe"),
        "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 7\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    # Fall back to the uninstall registry entries.
    $hives = @(
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $entry = $hives |
        ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } |
        Where-Object { $_.DisplayName -like "Inno Setup*" -and $_.InstallLocation } |
        Sort-Object DisplayName -Descending |
        Select-Object -First 1
    if ($entry) {
        $found = Join-Path $entry.InstallLocation "ISCC.exe"
        if (Test-Path $found) { return $found }
    }
    return $null
}

# Locates the Node installation that is already on this PC.
function Find-NodeDir {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { return (Split-Path -Parent $cmd.Source) }
    return $null
}

$packagingDir = $PSScriptRoot
$repo = Split-Path -Parent $packagingDir

Push-Location $repo
try {
    Write-Host "Building production bundle..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }

    $standalone = Join-Path $repo ".next\standalone"
    if (-not (Test-Path $standalone)) {
        throw "Missing .next\standalone. Is output: 'standalone' set in next.config.ts?"
    }

    $dest = Join-Path $repo (Join-Path $OutDir $AppName)
    if (Test-Path $dest) {
        Write-Host "Removing previous package at $dest" -ForegroundColor Yellow
        Remove-Item $dest -Recurse -Force
    }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null

    Write-Host "Copying server bundle..." -ForegroundColor Cyan
    Copy-Item (Join-Path $standalone "*") $dest -Recurse -Force

    # Next does not copy these two into the standalone folder.
    $staticDest = Join-Path $dest ".next\static"
    New-Item -ItemType Directory -Path $staticDest -Force | Out-Null
    Copy-Item (Join-Path $repo ".next\static\*") $staticDest -Recurse -Force

    $publicSrc = Join-Path $repo "public"
    if (Test-Path $publicSrc) {
        Copy-Item $publicSrc (Join-Path $dest "public") -Recurse -Force
    }

    Write-Host "Adding launcher and instructions..." -ForegroundColor Cyan
    Copy-Item (Join-Path $packagingDir "launch.vbs") $dest -Force
    Copy-Item (Join-Path $packagingDir "Start Email Blaster.bat") $dest -Force
    Copy-Item (Join-Path $packagingDir "Stop Email Blaster.bat") $dest -Force
    Copy-Item (Join-Path $packagingDir "README-FIRST.txt") $dest -Force

    if (-not $NodeDir) { $NodeDir = Find-NodeDir }

    if ($NodeDir) {
        $nodeExe = Join-Path $NodeDir "node.exe"
        if (-not (Test-Path $nodeExe)) {
            throw "node.exe not found in '$NodeDir'. Point -NodeDir at the folder that contains node.exe."
        }
        Copy-Item $nodeExe $dest -Force
        Write-Host "Bundled Node runtime from $NodeDir" -ForegroundColor Cyan
    } else {
        Write-Warning "Node was not found. Put a Node 20+ node.exe in '$dest' before shipping."
    }

    # --- Icon used by shortcuts and the installer --------------------------
    $installerDir = Join-Path $repo "installer"
    $icoPath = Join-Path $installerDir "app.ico"
    if (-not (Test-Path $icoPath)) {
        Write-Host "Generating app icon..." -ForegroundColor Cyan
        if (-not (New-AppIcon -Path $icoPath)) {
            throw "Could not create installer\app.ico. Save a 256x256 .ico there and re-run."
        }
    }

    Write-Host ""
    Write-Host "App folder ready: $dest" -ForegroundColor Green

    # --- Optional: build the single-file installer ------------------------
    if ($SkipInstaller) {
        Write-Host "Skipping installer build (-SkipInstaller)." -ForegroundColor Yellow
    } else {
        if (-not $InnoSetup) { $InnoSetup = Find-Iscc }

        if (-not $InnoSetup) {
            Write-Warning "Inno Setup (ISCC.exe) not found. The app folder is ready, but no .exe setup was built."
            Write-Warning "Install Inno Setup from https://jrsoftware.org/isdl.php, then run this script again."
        } else {
            Write-Host "Building installer with '$InnoSetup'..." -ForegroundColor Cyan
            & $InnoSetup (Join-Path $installerDir "email-blaster.iss")
            if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

            $setup = Get-ChildItem (Join-Path $repo $OutDir) -Filter "EmailBlaster-Setup-*.exe" |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            if ($setup) {
                Write-Host ""
                Write-Host "Installer ready: $($setup.FullName)" -ForegroundColor Green
                Write-Host "Send this one file to the customer." -ForegroundColor Green
            }
        }
    }
} finally {
    Pop-Location
}
