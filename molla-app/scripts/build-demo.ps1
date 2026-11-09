$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$previousDemo=$env:EXPO_PUBLIC_DEMO_MODE
$previousLocal=$env:EXPO_PUBLIC_ALLOW_LOCAL_API
$previousUrl=$env:EXPO_PUBLIC_API_URL
try {
 $env:EXPO_PUBLIC_DEMO_MODE='1'
 $env:EXPO_PUBLIC_ALLOW_LOCAL_API='1'
 $env:EXPO_PUBLIC_API_URL='http://127.0.0.1:4319'
 Push-Location (Join-Path $root 'apps/mobile')
 try { & node './node_modules/expo/bin/cli' export --platform web --output-dir ../../demo/mobile; if($LASTEXITCODE -ne 0){throw 'Demo build failed.'} } finally { Pop-Location }
} finally { $env:EXPO_PUBLIC_DEMO_MODE=$previousDemo; $env:EXPO_PUBLIC_ALLOW_LOCAL_API=$previousLocal; $env:EXPO_PUBLIC_API_URL=$previousUrl }
Write-Host 'Demo built. Start: node server/demo.mjs. Recording stage: http://127.0.0.1:4319/stage'
