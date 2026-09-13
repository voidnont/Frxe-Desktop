$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root "src-tauri"
$PinnedCommit = "5e8cec3611514bc73037bbf195efa066d6dd3fb8"
$SourceRepositoryId = "1367264568"
$TempRoot = Join-Path $env:TEMP "frxe-desktop-backend"
$Archive = Join-Path $TempRoot "backend.tar.gz"
$ExtractRoot = Join-Path $TempRoot "extract"
$ArchiveUrl = "https://api.github.com/repositories/$SourceRepositoryId/tarball/$PinnedCommit"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$utf8 = [System.Text.Encoding]::UTF8

Write-Host "[Frxe Desktop] Preparing pinned native backend..." -ForegroundColor Cyan

if (Test-Path $TempRoot) { Remove-Item $TempRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null

$headers = @{ "User-Agent" = "Frxe-Desktop-Build"; "Accept" = "application/vnd.github+json" }
Invoke-WebRequest -Uri $ArchiveUrl -Headers $headers -OutFile $Archive -MaximumRedirection 10
if (-not (Test-Path $Archive)) { throw "Could not download the pinned native backend snapshot." }

& tar.exe -xf $Archive -C $ExtractRoot
if ($LASTEXITCODE -ne 0) { throw "Could not extract the pinned native backend snapshot." }

$SnapshotRoot = Get-ChildItem -LiteralPath $ExtractRoot -Directory | Select-Object -First 1
if (-not $SnapshotRoot) { throw "The native backend snapshot did not contain a source directory." }

$SourceTauri = Join-Path $SnapshotRoot.FullName "src-tauri"
if (-not (Test-Path (Join-Path $SourceTauri "Cargo.toml"))) { throw "The native backend snapshot is missing src-tauri." }

if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
Copy-Item $SourceTauri $Target -Recurse -Force

$configPath = Join-Path $Target "tauri.conf.json"
$configText = [System.IO.File]::ReadAllText($configPath, $utf8)
$config = $configText | ConvertFrom-Json
$config.productName = "Frxe Desktop"
$config.version = "0.1.0"
$config.identifier = "app.frxe.desktop"
$config.build.frontendDist = "../web"
$config.build.PSObject.Properties.Remove("beforeDevCommand")
$config.build.PSObject.Properties.Remove("devUrl")
$config.build.PSObject.Properties.Remove("beforeBuildCommand")

if ($config.app.PSObject.Properties.Name -contains "withGlobalTauri") {
    $config.app.withGlobalTauri = $true
} else {
    $config.app | Add-Member -NotePropertyName "withGlobalTauri" -NotePropertyValue $true
}

$config.app.windows = @(
    [pscustomobject]@{
        label = "main"
        title = "Frxe Desktop"
        width = 1280
        height = 820
        minWidth = 900
        minHeight = 620
        resizable = $true
        fullscreen = $false
        decorations = $false
        devtools = $false
        backgroundColor = "#07070a"
        center = $true
        shadow = $true
    }
)

$config.bundle.active = $true
$config.bundle.targets = @("msi")
$config.bundle.shortDescription = "Frxe Desktop music player"
$config.bundle.longDescription = "Frxe Desktop by void - a liquid-glass Windows music experience."
$config.bundle.publisher = "void"
$config.bundle.homepage = "https://github.com/voidnont/Frxe-Windows"
$config.bundle.icon = @(
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.ico"
)

$json = $config | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($configPath, $json, $utf8NoBom)

$legacyName = ([string]::Concat('Nont', 'Music'))
$legacySlug = $legacyName.ToLowerInvariant()
Get-ChildItem -LiteralPath $Target -Recurse -File | Where-Object {
    $_.Extension -in @('.rs', '.toml', '.json', '.nsh', '.txt')
} | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName, $utf8)
    if ($null -eq $content) { return }
    $content = $content.Replace($legacyName, 'Frxe Desktop').Replace($legacySlug, 'frxe-desktop')
    $content = $content.Replace('frxe-desktop_lib', 'frxe_desktop_lib')
    [System.IO.File]::WriteAllText($_.FullName, $content, $utf8NoBom)
}

$iconTarget = Join-Path $Target "icons"
$iconInput = Join-Path $Root "assets\frxe-icon.svg"
if (-not (Test-Path $iconInput)) { throw "Frxe app icon source is missing." }

Push-Location $Root
try {
    & npx.cmd tauri icon $iconInput --output $iconTarget
    if ($LASTEXITCODE -ne 0) { throw "Could not generate Frxe Desktop icon set." }
} finally { Pop-Location }

Remove-Item $TempRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[OK] Native backend: $PinnedCommit" -ForegroundColor Green
Write-Host "[OK] Product: Frxe Desktop / app.frxe.desktop" -ForegroundColor Green
Write-Host "[OK] Icon: exact Frxe white/black/lime launcher" -ForegroundColor Green
Write-Host "[OK] Frontend: web" -ForegroundColor Green
