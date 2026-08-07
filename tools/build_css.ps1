# Rebuild css/app.css from css/input.css + tailwind.config.js.
#
#   powershell -ExecutionPolicy Bypass -File tools/build_css.ps1          one build
#   powershell -ExecutionPolicy Bypass -File tools/build_css.ps1 -Watch   rebuild on save
#
# Downloads the pinned standalone Tailwind CLI on first run (tools/bin/ is
# gitignored). See tools/build_css.md for the full story.
param([switch]$Watch)
$ErrorActionPreference = 'Stop'

$version = 'v3.4.17'
$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $PSScriptRoot 'bin'
$exe  = Join-Path $bin 'tailwindcss.exe'

if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force $bin | Out-Null
  $url = "https://github.com/tailwindlabs/tailwindcss/releases/download/$version/tailwindcss-windows-x64.exe"
  Write-Host "Downloading Tailwind CLI $version to tools/bin/ (~35 MB, one time)..."
  Invoke-WebRequest -Uri $url -OutFile $exe
}

$cliArgs = @(
  '-c', (Join-Path $root 'tailwind.config.js'),
  '-i', (Join-Path $root 'css\input.css'),
  '-o', (Join-Path $root 'css\app.css'),
  '--minify'
)
if ($Watch) { $cliArgs += '--watch' }

& $exe @cliArgs
