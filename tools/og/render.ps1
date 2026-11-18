# Renders tools/og/og.html to assets/og.png (1200x630) with headless Chrome.
# After a new render, bump the og:image ?v= on every page so Facebook refetches it.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'assets\og.png'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$userData = Join-Path $env:TEMP 'og-render-profile'
$page = 'file:///' + ((Join-Path $here 'og.html') -replace '\\', '/')
& $chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --user-data-dir="$userData" --window-size=1200,630 --virtual-time-budget=4000 `
  --screenshot="$out" $page 2>$null | Out-Null
Start-Sleep -Milliseconds 500
Get-Item $out | Select-Object Name, Length, LastWriteTime
