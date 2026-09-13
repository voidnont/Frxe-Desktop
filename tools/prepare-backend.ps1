$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend\NontMusic"
$Target = Join-Path $Root "src-tauri"
$PinnedCommit = "5e8cec3611514bc73037bbf195efa066d6dd3fb8"

Write-Host "[Frxe Desktop] Preparing pinned NontMusic backend..." -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $Backend "src-tauri\Cargo.toml"))) {
    if (Test-Path (Join-Path $Root ".git")) {
        Push-Location $Root
        try {
            & git submodule update --init --recursive
            if ($LASTEXITCODE -ne 0) { throw "git submodule update failed" }
        } finally { Pop-Location }
    }
}

if (-not (Test-Path (Join-Path $Backend "src-tauri\Cargo.toml"))) {
    if (Test-Path $Backend) { Remove-Item $Backend -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Backend) | Out-Null
    & git clone https://github.com/voidnont/NontMusic.git $Backend
    if ($LASTEXITCODE -ne 0) { throw "Could not clone the NontMusic backend." }
}

Push-Location $Backend
try {
    & git cat-file -e "$PinnedCommit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        & git fetch --quiet origin main
        if ($LASTEXITCODE -ne 0) { throw "Could not refresh the NontMusic backend." }
    }
    & git checkout --quiet --detach $PinnedCommit
    if ($LASTEXITCODE -ne 0) { throw "Could not check out pinned NontMusic backend commit." }
} finally { Pop-Location }

if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
Copy-Item (Join-Path $Backend "src-tauri") $Target -Recurse -Force

$configPath = Join-Path $Target "tauri.conf.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
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
$config.bundle.longDescription = "Frxe Desktop by void - the Frxe liquid-glass music experience powered by the NontMusic backend."
$config.bundle.publisher = "void"
$config.bundle.homepage = "https://github.com/voidnont/Frxe-Windows"
$config.bundle.icon = @(
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.ico"
)

$json = $config | ConvertTo-Json -Depth 100
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $json, $utf8NoBom)

$libPath = Join-Path $Target "src\lib.rs"
$lib = Get-Content -LiteralPath $libPath -Raw
$lib = $lib.Replace('"Show NontMusic"', '"Show Frxe Desktop"')
$lib = $lib.Replace('"Exit NontMusic"', '"Exit Frxe Desktop"')
$lib = $lib.Replace('.tooltip("NontMusic")', '.tooltip("Frxe Desktop")')
[System.IO.File]::WriteAllText($libPath, $lib, $utf8NoBom)

$iconTarget = Join-Path $Target "icons"
$iconBase64 = Join-Path $Root "assets\frxe-icon.png.b64"
$iconInput = Join-Path $env:TEMP "frxe-desktop-icon.png"
[System.IO.File]::WriteAllBytes($iconInput, [Convert]::FromBase64String((Get-Content -LiteralPath $iconBase64 -Raw).Trim()))

Push-Location $Root
try {
    & npx.cmd tauri icon $iconInput --output $iconTarget
    if ($LASTEXITCODE -ne 0) { throw "Could not generate Frxe Desktop icon set." }
} finally { Pop-Location }

Write-Host "[OK] Backend: NontMusic $PinnedCommit" -ForegroundColor Green
Write-Host "[OK] Product: Frxe Desktop / app.frxe.desktop" -ForegroundColor Green
Write-Host "[OK] Frontend: web" -ForegroundColor Green
